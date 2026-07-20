/**
 * OpenAI-compatible chat completions client (browser / Capacitor).
 */

const SETTINGS_KEY = 'cvjdfit.settings.v1';

export const DEFAULT_SETTINGS = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

/**
 * @returns {{ baseURL: string, apiKey: string, model: string }}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * @param {Partial<{ baseURL: string, apiKey: string, model: string }>} partial
 */
export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/**
 * @param {string} [s]
 */
export function maskSecret(s) {
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * @param {{ baseURL?: string, apiKey?: string, model?: string }} [settings]
 */
export function hasApiKey(settings = loadSettings()) {
  return Boolean(settings.apiKey?.trim());
}

/**
 * Call chat completions and parse JSON object from the assistant message.
 * @param {{
 *   system: string,
 *   user: string,
 *   settings?: { baseURL: string, apiKey: string, model: string },
 *   temperature?: number,
 * }} opts
 * @returns {Promise<object>}
 */
export async function chatJson(opts) {
  const settings = opts.settings ?? loadSettings();
  const base = (settings.baseURL || DEFAULT_SETTINGS.baseURL).replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const key = settings.apiKey?.trim();
  if (!key) throw new Error('API key missing');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_SETTINGS.model,
      temperature: opts.temperature ?? 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('LLM returned empty content');
  }

  const jsonText = extractJsonObject(content);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('LLM response was not valid JSON');
  }
}

/**
 * @param {string} text
 */
export function extractJsonObject(text) {
  const trimmed = String(text).trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
