/**
 * Local CV–JD matcher: extract requirements, score fit, surface gaps & rewrite hints.
 * Pure functions — unit-testable, no DOM / network.
 */

/** Tech & role lexicon (CN/EN). Longer phrases first for matching. */
export const TECH_LEXICON = [
  // Languages / runtimes
  'typescript', 'javascript', 'python', 'java', 'kotlin', 'swift', 'golang', 'go lang',
  'rust', 'c++', 'c#', 'ruby', 'php', 'scala', 'r语言', 'matlab',
  'node.js', 'nodejs', 'deno', 'bun',
  // Web / frontend
  'react native', 'react.js', 'react', 'vue.js', 'vue', 'angular', 'svelte', 'next.js', 'nextjs',
  'nuxt', 'html', 'css', 'sass', 'tailwind', 'webpack', 'vite', 'graphql', 'rest api', 'restful',
  // Backend / data
  'spring boot', 'spring', 'django', 'flask', 'fastapi', 'express', 'nestjs', 'dotnet', '.net',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'kafka', 'rabbitmq',
  'sql', 'nosql', 'sqlite', 'oracle', 'dynamodb',
  // Cloud / devops
  'aws', 'azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'docker', 'terraform',
  'ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'ansible', 'linux', 'nginx',
  // Mobile
  'android', 'ios', 'flutter', 'capacitor', 'xamarin', 'swiftui', 'jetpack compose',
  // AI / data
  'machine learning', 'deep learning', 'llm', 'nlp', 'pytorch', 'tensorflow', 'scikit-learn',
  'pandas', 'spark', 'hadoop', 'data science', '计算机视觉', '深度学习', '机器学习', '大模型',
  // Practices
  'microservices', '微服务', '敏捷', 'scrum', 'kanban', 'tdd', 'bdd', 'devops', 'sre',
  'system design', '系统设计', '架构设计', '分布式', '高并发', '高可用',
  // Soft / general (bilingual)
  'communication', 'leadership', 'teamwork', 'problem solving', '沟通能力', '团队协作',
  '项目管理', '产品经理', '产品设计', 'ui/ux', 'ux', 'ui', 'figma', 'sketch',
  // Chinese tech terms
  '前端', '后端', '全栈', '算法', '数据结构', '操作系统', '计算机网络',
  '嵌入式', '物联网', '区块链', '网络安全', '信息安全',
].sort((a, b) => b.length - a.length);

const REQUIREMENT_SECTION_RE =
  /(?:^|\n)\s*(?:requirements?|qualifications?|must[- ]haves?|nice[- ]to[- ]haves?|skills?(?:\s+required)?|what\s+(?:you(?:'ll|\s+will)\s+need|we(?:'re|\s+are)\s+looking\s+for)|任职要求|岗位要求|任职资格|职位要求|能力要求|技能要求|加分项|优先条件)\s*[:：]?\s*\n([\s\S]*?)(?=\n\s*(?:[A-Z][A-Za-z /&-]{2,40}|职责|工作内容|福利|关于我们|about\s+us|responsibilities|benefits)\s*[:：]?\s*\n|$)/gi;

const BULLET_LINE_RE = /^\s*(?:[-*•·▪▸►]|[0-9]+[.)]、?|[（(][0-9]+[）)])\s*(.+)$/;

const DEGREE_RE =
  /\b(?:ph\.?d|doctorate|mba|master'?s?|bachelor'?s?|bs|ba|ms|ma|b\.?s\.?|m\.?s\.?)\b|博士|硕士|本科|学士|大专/gi;

const YEARS_RE =
  /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp\.?)?|(\d+)\+?\s*年(?:以上)?(?:工作)?经验/gi;

/**
 * Normalize text for matching: lowercase, collapse whitespace, unify dashes.
 * @param {string} text
 */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Escape string for RegExp.
 * @param {string} s
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a lexicon term appears as a whole token / phrase in haystack.
 * @param {string} haystackNorm
 * @param {string} term
 */
export function containsTerm(haystackNorm, term) {
  const t = normalizeText(term);
  if (!t) return false;
  // CJK: substring ok; Latin: word-ish boundary
  if (/[\u4e00-\u9fff]/.test(t)) {
    return haystackNorm.includes(t);
  }
  const re = new RegExp(`(?:^|[^a-z0-9.+#])${escapeRe(t)}(?:$|[^a-z0-9.+#])`, 'i');
  return re.test(haystackNorm);
}

/**
 * Pull requirement-ish lines from JD (section blocks + bullets + lexicon hits).
 * @param {string} jd
 * @returns {string[]}
 */
export function extractRequirements(jd) {
  const raw = String(jd ?? '');
  const found = new Map(); // norm -> display

  const add = (phrase) => {
    const cleaned = phrase.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2 || cleaned.length > 120) return;
    const norm = normalizeText(cleaned);
    if (!norm || found.has(norm)) return;
    found.set(norm, cleaned);
  };

  // Section bodies
  let m;
  const sectionRe = new RegExp(REQUIREMENT_SECTION_RE.source, REQUIREMENT_SECTION_RE.flags);
  while ((m = sectionRe.exec(raw)) !== null) {
    const body = m[1] || '';
    for (const line of body.split(/\n/)) {
      const bullet = line.match(BULLET_LINE_RE);
      const content = (bullet ? bullet[1] : line).trim();
      if (!content || content.length < 3) continue;
      // Split on common separators inside a line
      for (const part of content.split(/[;；|/｜、]/)) {
        add(part);
      }
    }
  }

  // All bullet lines in doc
  for (const line of raw.split(/\n/)) {
    const bullet = line.match(BULLET_LINE_RE);
    if (bullet) add(bullet[1]);
  }

  // Lexicon terms present in JD
  const jdNorm = normalizeText(raw);
  for (const term of TECH_LEXICON) {
    if (containsTerm(jdNorm, term)) add(term);
  }

  // Years / degree mentions as soft requirements
  const years = [...raw.matchAll(YEARS_RE)].map((x) => x[0].trim());
  for (const y of years) add(y);
  const degrees = [...raw.matchAll(DEGREE_RE)].map((x) => x[0].trim());
  for (const d of degrees) add(d);

  return [...found.values()];
}

/**
 * Extract skill-like tokens present in CV text (lexicon + simple skill lines).
 * @param {string} cv
 * @returns {string[]}
 */
export function extractCvSkills(cv) {
  const raw = String(cv ?? '');
  const found = new Map();
  const cvNorm = normalizeText(raw);

  for (const term of TECH_LEXICON) {
    if (containsTerm(cvNorm, term)) {
      found.set(normalizeText(term), term);
    }
  }

  // Skills section lines
  const skillsBlock = raw.match(
    /(?:^|\n)\s*(?:skills?|技术栈|专业技能|技能特长|核心技能)\s*[:：]?\s*\n([\s\S]{0,1200}?)(?=\n\s*(?:experience|education|projects?|工作经历|教育|项目)\b|$)/i,
  );
  if (skillsBlock) {
    for (const line of skillsBlock[1].split(/\n/)) {
      const content = line.replace(BULLET_LINE_RE, '$1').trim();
      for (const part of content.split(/[,，;；|/｜、]/)) {
        const p = part.trim();
        if (p.length >= 2 && p.length <= 40) found.set(normalizeText(p), p);
      }
    }
  }

  return [...found.values()];
}

/**
 * Classify a JD requirement against the CV.
 * @param {string} requirement
 * @param {string} cvNorm
 * @param {string} cvRaw
 * @returns {'matched'|'weak'|'missing'}
 */
export function classifyRequirement(requirement, cvNorm, cvRaw) {
  const reqNorm = normalizeText(requirement);
  if (!reqNorm) return 'missing';

  // Direct phrase hit
  if (cvNorm.includes(reqNorm) || containsTerm(cvNorm, requirement)) {
    return 'matched';
  }

  // Lexicon overlap: any lexicon term in the requirement that also appears in CV
  const reqTerms = TECH_LEXICON.filter((t) => containsTerm(reqNorm, t));
  if (reqTerms.length) {
    const hit = reqTerms.filter((t) => containsTerm(cvNorm, t));
    if (hit.length === reqTerms.length) return 'matched';
    if (hit.length > 0) return 'weak';
  }

  // Years of experience: if JD asks N years and CV mentions any years >= N loosely
  const jdYears = [...requirement.matchAll(YEARS_RE)].map((m) => Number(m[1] || m[2]));
  if (jdYears.length) {
    const need = Math.max(...jdYears);
    const cvYears = [...String(cvRaw).matchAll(YEARS_RE)].map((m) => Number(m[1] || m[2]));
    if (cvYears.some((y) => y >= need)) return 'matched';
    if (cvYears.length) return 'weak';
  }

  // Degree
  if (DEGREE_RE.test(requirement)) {
    DEGREE_RE.lastIndex = 0;
    if (DEGREE_RE.test(cvRaw)) {
      DEGREE_RE.lastIndex = 0;
      return 'matched';
    }
    DEGREE_RE.lastIndex = 0;
  }

  // Token overlap heuristic for longer phrases
  const tokens = reqNorm
    .split(/[^a-z0-9\u4e00-\u9fff.+#]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  if (tokens.length >= 2) {
    const hits = tokens.filter((t) => cvNorm.includes(t));
    const ratio = hits.length / tokens.length;
    if (ratio >= 0.7) return 'matched';
    if (ratio >= 0.35) return 'weak';
  }

  return 'missing';
}

const STOP = new Set([
  'and', 'or', 'the', 'with', 'for', 'from', 'that', 'this', 'have', 'has', 'will',
  'your', 'our', 'you', 'are', 'is', 'be', 'of', 'in', 'to', 'a', 'an', 'on',
  'experience', 'ability', 'knowledge', 'strong', 'good', 'using', 'including',
  '工作', '经验', '能力', '熟悉', '掌握', '了解', '优先', '相关', '以上', '具备',
]);

/**
 * Build rewrite hints from gaps.
 * @param {{ matched: string[], missing: string[], weak: string[] }} buckets
 * @returns {string[]}
 */
export function buildRewriteHints(buckets) {
  const hints = [];
  if (buckets.missing.length) {
    const top = buckets.missing.slice(0, 5);
    hints.push(
      `Highlight any real exposure to: ${top.join(', ')} — only if already in your CV; do not invent.`,
    );
  }
  if (buckets.weak.length) {
    hints.push(
      `Strengthen weak matches (${buckets.weak.slice(0, 4).join(', ')}) with concrete tools, metrics, or project names already present.`,
    );
  }
  if (buckets.matched.length) {
    hints.push(
      `Lead Summary/Skills with matched strengths: ${buckets.matched.slice(0, 6).join(', ')}.`,
    );
  }
  hints.push('Reorder sections for the role; keep employers, titles, dates, and achievements factual.');
  return hints;
}

/**
 * Score CV against JD.
 * @param {string} cv
 * @param {string} jd
 * @returns {{
 *   score: number,
 *   matched: string[],
 *   missing: string[],
 *   weak: string[],
 *   requirements: string[],
 *   cvSkills: string[],
 *   rewriteHints: string[],
 * }}
 */
export function matchCvToJd(cv, jd) {
  const requirements = extractRequirements(jd);
  const cvSkills = extractCvSkills(cv);
  const cvNorm = normalizeText(cv);
  const cvRaw = String(cv ?? '');

  const matched = [];
  const missing = [];
  const weak = [];

  const reqs = requirements.length
    ? requirements
    : TECH_LEXICON.filter((t) => containsTerm(normalizeText(jd), t));

  for (const req of reqs) {
    const kind = classifyRequirement(req, cvNorm, cvRaw);
    if (kind === 'matched') matched.push(req);
    else if (kind === 'weak') weak.push(req);
    else missing.push(req);
  }

  const total = matched.length + missing.length + weak.length;
  let score = 0;
  if (total === 0) {
    // Fallback: lexicon overlap ratio
    const jdTerms = TECH_LEXICON.filter((t) => containsTerm(normalizeText(jd), t));
    const hits = jdTerms.filter((t) => containsTerm(cvNorm, t));
    score = jdTerms.length ? Math.round((hits.length / jdTerms.length) * 100) : 50;
  } else {
    const points = matched.length * 1 + weak.length * 0.45;
    score = Math.round((points / total) * 100);
  }
  score = Math.max(0, Math.min(100, score));

  const buckets = { matched, missing, weak };
  return {
    score,
    matched,
    missing,
    weak,
    requirements: reqs,
    cvSkills,
    rewriteHints: buildRewriteHints(buckets),
  };
}
