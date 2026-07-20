/**
 * Tailored resume generation: rule-based (no key) or LLM with rule fallback.
 * Never invents employers, titles, dates, or achievements.
 */

import { matchCvToJd, normalizeText, containsTerm, TECH_LEXICON } from './matcher.js';
import { chatJson, hasApiKey, loadSettings } from './llm.js';

const SECTION_HEADERS = [
  { id: 'summary', re: /^(?:summary|profile|about|overview|个人简介|自我评价|简介)\s*$/i },
  { id: 'skills', re: /^(?:skills?|technical skills?|core skills?|技术栈|专业技能|技能特长|核心技能)\s*$/i },
  { id: 'experience', re: /^(?:experience|work experience|employment|工作经历|工作经验|职业经历)\s*$/i },
  { id: 'projects', re: /^(?:projects?|selected projects?|项目经历|项目经验)\s*$/i },
  { id: 'education', re: /^(?:education|学历|教育背景|教育经历)\s*$/i },
  { id: 'other', re: /^(?:certifications?|awards?|languages?|证书|获奖|语言)\s*$/i },
];

/**
 * Split markdown/plain CV into titled sections.
 * @param {string} cv
 * @returns {{ title: string, id: string, body: string }[]}
 */
export function parseSections(cv) {
  const lines = String(cv ?? '').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let current = { title: 'Header', id: 'header', body: [] };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^([A-Za-z\u4e00-\u9fff /&-]{2,40})\s*$/);
    const title = heading ? (heading[1] || '').trim() : '';
    const kind = title ? SECTION_HEADERS.find((h) => h.re.test(title)) : null;
    if (kind) {
      sections.push({ title: current.title, id: current.id, body: current.body.join('\n').trim() });
      current = { title, id: kind.id, body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push({ title: current.title, id: current.id, body: current.body.join('\n').trim() });
  return sections.filter((s) => s.body || s.id === 'header');
}

/**
 * Collect skill tokens from CV that match JD priorities.
 * @param {string} cv
 * @param {string[]} priorityTerms
 */
function prioritizeSkills(cv, priorityTerms) {
  const cvNorm = normalizeText(cv);
  const present = [];
  const seen = new Set();
  for (const term of priorityTerms) {
    const n = normalizeText(term);
    if (seen.has(n)) continue;
    if (containsTerm(cvNorm, term) || cvNorm.includes(n)) {
      seen.add(n);
      present.push(term);
    }
  }
  for (const term of TECH_LEXICON) {
    const n = normalizeText(term);
    if (seen.has(n)) continue;
    if (containsTerm(cvNorm, term)) {
      seen.add(n);
      present.push(term);
    }
  }
  return present;
}

/**
 * Build a short summary from existing summary + matched skills (no new facts).
 * @param {string} existing
 * @param {string[]} matched
 */
function rewriteSummary(existing, matched) {
  const base = existing.replace(/\s+/g, ' ').trim();
  const lead = matched.slice(0, 5);
  if (!lead.length) return base || 'Experienced professional seeking a role aligned with the target job description.';
  const skillsPhrase = lead.join(', ');
  if (!base) {
    return `Candidate with demonstrated experience related to ${skillsPhrase}. (Facts only — drawn from the original CV skills/experience.)`;
  }
  // Prepend emphasis without inventing employers
  if (normalizeText(base).includes(normalizeText(lead[0]))) return base;
  return `${base}\n\nEmphasized for this role: ${skillsPhrase}.`;
}

/**
 * Rule-based tailored resume. Keeps experience/education/projects bodies intact.
 * @param {string} cv
 * @param {string} jd
 * @param {ReturnType<typeof matchCvToJd>} [analysis]
 */
export function rewriteRuleBased(cv, jd, analysis) {
  const report = analysis ?? matchCvToJd(cv, jd);
  const sections = parseSections(cv);
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

  const priority = [...report.matched, ...report.weak];
  const skillsOrdered = prioritizeSkills(cv, priority);

  const summaryBody = rewriteSummary(byId.summary?.body || '', report.matched);
  const skillsBody = skillsOrdered.length
    ? skillsOrdered.map((s) => `- ${s}`).join('\n')
    : byId.skills?.body || '';

  const order = ['header', 'summary', 'skills', 'experience', 'projects', 'education', 'other'];
  const used = new Set();
  const parts = [];

  const header = byId.header?.body?.trim();
  if (header) {
    parts.push(header);
    used.add('header');
  }

  parts.push('## Summary');
  parts.push(summaryBody);
  used.add('summary');

  if (skillsBody) {
    parts.push('## Skills');
    parts.push(skillsBody);
    used.add('skills');
  }

  for (const id of ['experience', 'projects', 'education', 'other']) {
    const sec = byId[id];
    if (!sec?.body) continue;
    parts.push(`## ${sec.title}`);
    parts.push(sec.body);
    used.add(id);
  }

  // Preserve any unrecognized sections
  for (const sec of sections) {
    if (used.has(sec.id) || !sec.body) continue;
    if (sec.id === 'header') continue;
    parts.push(`## ${sec.title}`);
    parts.push(sec.body);
  }

  const tailoredResume = parts.filter(Boolean).join('\n\n').trim() + '\n';

  const edits = [
    {
      kind: 'reorder',
      detail: 'Moved Summary and Skills near the top; prioritized JD-matched skills already present in the CV.',
    },
    ...report.missing.slice(0, 6).map((m) => ({
      kind: 'gap',
      detail: `JD asks for “${m}” — not clearly found in CV. Do not invent; add only if you have real experience.`,
    })),
    ...report.weak.slice(0, 4).map((w) => ({
      kind: 'strengthen',
      detail: `Weak match for “${w}” — emphasize existing related bullets if any.`,
    })),
  ];

  return {
    mode: 'rules',
    score: report.score,
    gaps: report.missing,
    edits,
    tailoredResume,
    analysis: report,
  };
}

const SYSTEM_PROMPT = `You rewrite resumes to better match a job description.
HARD RULES:
- Never invent employers, job titles, dates, degrees, metrics, or achievements not present in the original CV.
- You may reorder sections, rephrase for clarity, and emphasize skills/experience that already exist.
- If a JD skill is missing from the CV, list it under gaps; do NOT add it as experience.
- Return ONLY a JSON object with keys:
  score (number 0-100),
  gaps (string[]),
  edits (array of { kind: string, detail: string }),
  tailoredResume (markdown string).`;

/**
 * LLM-backed rewrite; throws on failure (caller may fall back).
 * @param {string} cv
 * @param {string} jd
 * @param {ReturnType<typeof matchCvToJd>} [analysis]
 * @param {{ baseURL: string, apiKey: string, model: string }} [settings]
 */
export async function rewriteWithLlm(cv, jd, analysis, settings) {
  const report = analysis ?? matchCvToJd(cv, jd);
  const user = JSON.stringify({
    instruction: 'Produce tailoredResume markdown. Be honest about gaps.',
    localAnalysis: {
      score: report.score,
      matched: report.matched,
      missing: report.missing,
      weak: report.weak,
      rewriteHints: report.rewriteHints,
    },
    jobDescription: jd,
    originalCv: cv,
  });

  const json = await chatJson({
    system: SYSTEM_PROMPT,
    user,
    settings: settings ?? loadSettings(),
    temperature: 0.25,
  });

  const tailoredResume = String(json.tailoredResume || '').trim();
  if (!tailoredResume) throw new Error('LLM omitted tailoredResume');

  return {
    mode: 'llm',
    score: clampScore(json.score ?? report.score),
    gaps: Array.isArray(json.gaps) ? json.gaps.map(String) : report.missing,
    edits: Array.isArray(json.edits)
      ? json.edits.map((e) => ({
          kind: String(e?.kind || 'edit'),
          detail: String(e?.detail || ''),
        }))
      : [],
    tailoredResume: tailoredResume.endsWith('\n') ? tailoredResume : `${tailoredResume}\n`,
    analysis: report,
  };
}

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Generate tailored resume: LLM if key present, else rules; LLM failure → rules.
 * @param {string} cv
 * @param {string} jd
 * @param {{ settings?: ReturnType<typeof loadSettings> }} [opts]
 */
export async function generateTailoredResume(cv, jd, opts = {}) {
  const analysis = matchCvToJd(cv, jd);
  const settings = opts.settings ?? loadSettings();

  if (hasApiKey(settings)) {
    try {
      return await rewriteWithLlm(cv, jd, analysis, settings);
    } catch (err) {
      const fallback = rewriteRuleBased(cv, jd, analysis);
      return {
        ...fallback,
        mode: 'rules-fallback',
        llmError: err?.message || String(err),
      };
    }
  }

  return rewriteRuleBased(cv, jd, analysis);
}
