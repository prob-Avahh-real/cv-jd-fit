# CV-JD Fit

Match a CV against a job description: local fit score (0–100), matched / weak / missing skills, edit suggestions, and a **tailored Markdown resume**.

**Targets:** web browser + Android Capacitor APK. No wearable input.

**Honesty rule:** the app never invents employers, titles, dates, or achievements. Rule-based and LLM paths only reorder / emphasize facts already in your CV. Missing JD skills stay listed as gaps.

## Features

1. **Input** — paste CV or upload `.txt` / `.md` / `.pdf` (lightweight PDF text extract; fails gracefully to paste); JD textarea
2. **Settings** — OpenAI-compatible `baseURL` + `apiKey` + `model` in `localStorage`
3. **Local matcher** — CN/EN requirements + tech lexicon; score and rewrite hints
4. **Tailored resume**
   - No API key → rule-based rewrite
   - With key → chat completions JSON `{ score, gaps, edits[], tailoredResume }`; falls back to rules on failure
5. **UI** — score ring, gap lists, suggestions, editable Markdown, copy / download

## Web preview

```bash
cd /Users/skat/Projects/active/cv-jd-fit
npm install
npm test
npm run build
npm start          # http://localhost:5192
```

Works in desktop and mobile browsers (responsive layout). Use this path for day-to-day iteration.

## Android APK

Requires Android SDK (`android/local.properties` → `sdk.dir=…`). `apk:debug` uses Homebrew **OpenJDK 17** via `JAVA_HOME` (more reliable than system JDK 24 for AGP).

```bash
npm run sync:android    # build www + cap sync
npm run apk:debug       # debug APK (JDK 17)
npm run mobile:android  # sync + open Android Studio
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

After HTML / `src/` changes: `npm run build`, then `npm run sync:android`.

## Commands

| Script | Purpose |
|--------|---------|
| `npm test` | Unit tests (`matcher`, rewrite helpers) |
| `npm run build` | Bundle `src/app.js` → `www/js/app.js`, copy `index.html` |
| `npm start` | Build + serve `www` on port **5192** |
| `npm run sync:android` | Build + Capacitor sync |
| `npm run apk:debug` | Sync + Gradle debug APK |

## Layout

```
src/
  app.js         # UI
  matcher.js     # local JD/CV match + score
  rewrite.js     # rules + LLM orchestration
  llm.js         # OpenAI-compatible client + settings
  pdf-text.js    # lightweight PDF extract
test/matcher.test.js
www/             # build output
android/         # Capacitor Android
```

## Caveats

- **PDF extract** is intentionally lightweight (string / `Tj` operators). Text-layer PDFs work best; scanned/image PDFs often fail — paste text instead.
- **LLM** requires a reachable OpenAI-compatible endpoint; CORS may block some hosts in pure browser mode. On failure, the app falls back to rules.
- Settings (including API key) stay on-device in `localStorage`.
