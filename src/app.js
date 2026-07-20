import { matchCvToJd } from './matcher.js';
import { generateTailoredResume } from './rewrite.js';
import { loadSettings, saveSettings, hasApiKey, maskSecret } from './llm.js';
import { readResumeFile } from './pdf-text.js';

const $ = (sel) => document.querySelector(sel);

const cvEl = $('#cv');
const jdEl = $('#jd');
const statusEl = $('#status');
const fileStatusEl = $('#file-status');
const settingsStatusEl = $('#settings-status');

const baseURLEl = $('#baseURL');
const apiKeyEl = $('#apiKey');
const modelEl = $('#model');

let lastResult = null;

function setStatus(el, text, kind = '') {
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

function loadSettingsIntoForm() {
  const s = loadSettings();
  baseURLEl.value = s.baseURL || '';
  apiKeyEl.value = s.apiKey || '';
  modelEl.value = s.model || '';
  if (s.apiKey) {
    setStatus(settingsStatusEl, `Key saved (${maskSecret(s.apiKey)}). LLM rewrite enabled when analyzing.`, 'ok');
  } else {
    setStatus(settingsStatusEl, 'No API key — rule-based rewrite only.', '');
  }
}

function persistSettingsFromForm() {
  const next = saveSettings({
    baseURL: baseURLEl.value.trim() || 'https://api.openai.com/v1',
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim() || 'gpt-4o-mini',
  });
  setStatus(
    settingsStatusEl,
    next.apiKey
      ? `Saved. LLM enabled (${maskSecret(next.apiKey)} · ${next.model}).`
      : 'Saved. No key — using rule-based rewrite.',
    'ok',
  );
  return next;
}

function renderChips(el, items, kind) {
  el.innerHTML = '';
  if (!items?.length) {
    const span = document.createElement('span');
    span.className = 'chip empty';
    span.textContent = 'None';
    el.appendChild(span);
    return;
  }
  for (const item of items) {
    const span = document.createElement('span');
    span.className = `chip ${kind}`;
    span.textContent = item;
    el.appendChild(span);
  }
}

function renderReport(analysis, mode) {
  $('#report-empty').hidden = true;
  $('#report').hidden = false;

  const score = analysis.score ?? 0;
  $('#score-ring').style.setProperty('--p', String(score));
  $('#score-value').textContent = String(score);

  const blurb =
    score >= 75
      ? 'Strong overlap — lead with matched skills and keep experience factual.'
      : score >= 45
        ? 'Partial fit — emphasize real matches; treat missing items as gaps, not inventions.'
        : 'Low overlap — consider a different role or only claim skills you already have.';
  $('#score-blurb').textContent = blurb;

  const modeLabels = {
    rules: 'Rule-based rewrite',
    llm: 'LLM rewrite',
    'rules-fallback': 'Rules (LLM failed)',
    score: 'Score only',
  };
  $('#mode-pill').textContent = modeLabels[mode] || mode;

  renderChips($('#matched-chips'), analysis.matched, 'matched');
  renderChips($('#weak-chips'), analysis.weak, 'weak');
  renderChips($('#missing-chips'), analysis.missing, 'missing');
}

function renderEdits(edits, hints) {
  const list = $('#edits-list');
  const empty = $('#edits-empty');
  list.innerHTML = '';

  const items = [];
  if (Array.isArray(edits)) {
    for (const e of edits) {
      items.push({ kind: e.kind || 'edit', detail: e.detail || '' });
    }
  }
  if (Array.isArray(hints)) {
    for (const h of hints) {
      items.push({ kind: 'hint', detail: h });
    }
  }

  if (!items.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="kind">${escapeHtml(item.kind)}</span>${escapeHtml(item.detail)}`;
    list.appendChild(li);
  }
}

function renderResume(markdown) {
  if (!markdown) {
    $('#resume-empty').hidden = false;
    $('#resume-wrap').hidden = true;
    return;
  }
  $('#resume-empty').hidden = true;
  $('#resume-wrap').hidden = false;
  $('#resume-out').value = markdown;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateInputs() {
  const cv = cvEl.value.trim();
  const jd = jdEl.value.trim();
  if (!cv) {
    setStatus(statusEl, 'Please paste or upload your CV.', 'warn');
    cvEl.focus();
    return null;
  }
  if (!jd) {
    setStatus(statusEl, 'Please paste the job description.', 'warn');
    jdEl.focus();
    return null;
  }
  return { cv, jd };
}

async function runAnalyze({ tailor }) {
  const inputs = validateInputs();
  if (!inputs) return;

  persistSettingsFromForm();
  const settings = loadSettings();

  const analyzeBtn = $('#analyze');
  const scoreBtn = $('#analyze-only');
  analyzeBtn.disabled = true;
  scoreBtn.disabled = true;

  setStatus(
    statusEl,
    tailor
      ? hasApiKey(settings)
        ? 'Calling LLM… (falls back to rules on failure)'
        : 'Scoring & rule-based rewrite…'
      : 'Scoring locally…',
    'busy',
  );

  try {
    if (!tailor) {
      const analysis = matchCvToJd(inputs.cv, inputs.jd);
      lastResult = { analysis, mode: 'score', tailoredResume: '', edits: [], gaps: analysis.missing };
      renderReport(analysis, 'score');
      renderEdits(
        analysis.rewriteHints.map((h) => ({ kind: 'hint', detail: h })),
        [],
      );
      renderResume('');
      setStatus(statusEl, `Score ${analysis.score}/100 · local matcher`, 'ok');
      return;
    }

    const result = await generateTailoredResume(inputs.cv, inputs.jd, { settings });
    lastResult = result;
    renderReport(result.analysis || matchCvToJd(inputs.cv, inputs.jd), result.mode);
    renderEdits(result.edits, result.analysis?.rewriteHints);
    renderResume(result.tailoredResume);

    if (result.mode === 'rules-fallback') {
      setStatus(statusEl, `Score ${result.score}/100 · rules fallback (${result.llmError})`, 'warn');
    } else if (result.mode === 'llm') {
      setStatus(statusEl, `Score ${result.score}/100 · LLM tailored resume ready`, 'ok');
    } else {
      setStatus(statusEl, `Score ${result.score}/100 · rule-based tailored resume ready`, 'ok');
    }
  } catch (err) {
    setStatus(statusEl, err?.message || 'Analysis failed', 'err');
  } finally {
    analyzeBtn.disabled = false;
    scoreBtn.disabled = false;
  }
}

async function onFileSelected(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  setStatus(fileStatusEl, `Reading ${file.name}…`, 'busy');
  try {
    const result = await readResumeFile(file);
    if (!result.ok) {
      const messages = {
        'no-text-layer': 'PDF has little extractable text (likely scanned). Paste text instead.',
        'not-pdf': 'File is not a valid PDF.',
        'unsupported-type': 'Unsupported type. Use .txt, .md, or .pdf.',
        'empty-file': 'File is empty.',
      };
      setStatus(fileStatusEl, messages[result.reason] || `Could not read file (${result.reason}). Paste text instead.`, 'err');
      return;
    }
    cvEl.value = result.text;
    setStatus(
      fileStatusEl,
      result.source === 'pdf'
        ? `Loaded PDF text (${result.text.length} chars). Review for OCR gaps.`
        : `Loaded ${file.name}`,
      'ok',
    );
  } catch (err) {
    setStatus(fileStatusEl, err?.message || 'Upload failed — please paste text.', 'err');
  } finally {
    ev.target.value = '';
  }
}

async function copyResume() {
  const text = $('#resume-out').value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(statusEl, 'Resume copied to clipboard', 'ok');
  } catch {
    $('#resume-out').select();
    setStatus(statusEl, 'Select-all ready — press ⌘/Ctrl+C to copy', 'warn');
  }
}

function downloadResume() {
  const text = $('#resume-out').value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tailored-resume.md';
  a.click();
  URL.revokeObjectURL(url);
  setStatus(statusEl, 'Downloaded tailored-resume.md', 'ok');
}

function init() {
  loadSettingsIntoForm();

  $('#save-settings').addEventListener('click', () => persistSettingsFromForm());
  $('#clear-key').addEventListener('click', () => {
    apiKeyEl.value = '';
    saveSettings({ apiKey: '' });
    setStatus(settingsStatusEl, 'API key cleared. Rule-based rewrite only.', 'ok');
  });

  $('#analyze').addEventListener('click', () => runAnalyze({ tailor: true }));
  $('#analyze-only').addEventListener('click', () => runAnalyze({ tailor: false }));
  $('#cv-file').addEventListener('change', onFileSelected);
  $('#copy-resume').addEventListener('click', copyResume);
  $('#download-resume').addEventListener('click', downloadResume);
}

init();
