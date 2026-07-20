/**
 * Lightweight PDF text extraction (no heavy PDF.js dependency).
 * Reads PDF string/stream text operators. Fails gracefully — caller should offer paste.
 */

/**
 * Extract readable text from a PDF ArrayBuffer.
 * @param {ArrayBuffer} buffer
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
 */
export function extractPdfText(buffer) {
  try {
    if (!buffer || !(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
      return { ok: false, reason: 'invalid-buffer' };
    }
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer);
    if (bytes.length < 5) return { ok: false, reason: 'too-small' };

    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if (head !== '%PDF-') return { ok: false, reason: 'not-pdf' };

    // Decode as Latin-1 to preserve byte→char mapping for operator scanning
    let raw = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      raw += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }

    // Prefer uncompressed stream payloads between stream/endstream
    const streamBodies = [];
    const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
    let sm;
    while ((sm = streamRe.exec(raw)) !== null) {
      streamBodies.push(sm[1]);
    }

    const haystacks = streamBodies.length ? streamBodies : [raw];
    const pieces = [];

    for (const hay of haystacks) {
      // Skip obviously binary/compressed blobs (high NUL / control density)
      if (binaryDensity(hay) > 0.15) continue;

      // (Hello World) Tj  or  [(He)4(llo)] TJ
      const tj = /\((?:\\.|[^\\()])*\)\s*Tj/g;
      let m;
      while ((m = tj.exec(hay)) !== null) {
        pieces.push(unescapePdfString(m[0].replace(/\s*Tj$/, '')));
      }

      const tjArr = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\s*TJ/g;
      while ((m = tjArr.exec(hay)) !== null) {
        const inner = m[1];
        const parts = inner.match(/\((?:\\.|[^\\()])*\)/g) || [];
        pieces.push(parts.map(unescapePdfString).join(''));
      }
    }

    let text = pieces.join(' ').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

    // Fallback: any printable runs in the whole file
    if (text.length < 40) {
      const runs = raw.match(/[\x20-\x7E\u00A0-\u024F]{4,}/g) || [];
      text = runs
        .filter((r) => !/^\/[A-Za-z]/.test(r) && !/endstream|endobj|xref/.test(r))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (text.length < 20) {
      return {
        ok: false,
        reason: 'no-text-layer',
      };
    }

    return { ok: true, text: text.slice(0, 200_000) };
  } catch (err) {
    return { ok: false, reason: err?.message || 'extract-failed' };
  }
}

/**
 * @param {string} s
 */
function binaryDensity(s) {
  if (!s.length) return 1;
  let bad = 0;
  const n = Math.min(s.length, 4000);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad++;
  }
  return bad / n;
}

/**
 * Unescape PDF literal string `(...)`.
 * @param {string} literal
 */
export function unescapePdfString(literal) {
  let s = literal.trim();
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * Read a File / Blob as text (.txt/.md) or PDF extract.
 * @param {File|Blob} file
 * @returns {Promise<{ ok: true, text: string, source: string } | { ok: false, reason: string }>}
 */
export async function readResumeFile(file) {
  if (!file) return { ok: false, reason: 'no-file' };
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  if (name.endsWith('.pdf') || type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    const result = extractPdfText(buf);
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
      };
    }
    return { ok: true, text: result.text, source: 'pdf' };
  }

  if (
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.markdown') ||
    type.startsWith('text/') ||
    !name.includes('.')
  ) {
    const text = await file.text();
    if (!text.trim()) return { ok: false, reason: 'empty-file' };
    return { ok: true, text, source: 'text' };
  }

  return { ok: false, reason: 'unsupported-type' };
}
