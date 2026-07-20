# CV-JD Fit — Agent Notes

## Product

Mobile-first Capacitor 6 app + web preview for CV–JD keyword matching and honest resume rewrite.

**Targets:** Android APK + browser (`npm start` → port **5192**). **No wearables** (no ring / cane / watch, no `wearable-input.js`).

## Commands

```bash
npm install
npm test
npm run build
npm start                 # serve www on :5192
npm run sync:android
npm run apk:debug
```

## Layout

- `src/matcher.js` — `extractRequirements`, `matchCvToJd`, `TECH_LEXICON`, rewrite hints
- `src/rewrite.js` — `rewriteRuleBased` / `generateTailoredResume` (LLM + rule fallback)
- `src/llm.js` — settings in `localStorage` (`cvjdfit.settings.v1`) + `chatJson`
- `src/pdf-text.js` — lightweight PDF text extract; fail with paste hint
- `src/app.js` — input / report / suggestions / resume / settings UI
- `scripts/build-web.js` — esbuild IIFE → `www/js/app.js`, copy `index.html`
- `capacitor.config.json` — `appId: com.skat.cvjdfit`, `webDir: www`

## Honesty rule

Never invent employers, titles, dates, or skills absent from the source CV. Gaps stay in suggestions / gap lists, not fake bullets.

## Extending

- New skill terms: add to `TECH_LEXICON` in `matcher.js`; cover in `test/matcher.test.js`
- New rewrite strategy: keep rule path as offline default; LLM optional with fallback
- UI: extend `app.js` + `index.html`; analyze flow stays in one place

## Out of scope

- Job board scraping / ATS auto-apply
- Wearable input
- Storing API keys off-device
