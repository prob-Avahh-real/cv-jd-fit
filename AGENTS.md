# CV-JD Fit — Agent Notes

## Product

Mobile-first Capacitor 6 app + web preview for CV–JD keyword matching and honest resume rewrite.

**Targets:** Android APK + browser (`npm start` → port **5192**). **No wearables** (no ring / cane / watch, no `wearable-input.js`).

## 用途与 Target 判定

| 平台 | 需要? | 方式 |
|------|-------|------|
| 移动端 | 需要 | Capacitor 6 Android APK + Web 预览 (`:5192`) |
| 智能硬件 | 不适用 | 简历与岗位描述文本匹配工具，无穿戴输入 |

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

## Harness / Loop（助手）

- 遵循根 `/Users/skat/AGENTS.md`：**Harness Engineering** + **Loop Engineering**
- Guide = 本文件；Sensor = 下方验证命令；同类失误第二次须沉淀规则或测试（棘轮）
- 开干前写清 **Done**；每切片过验证环；显式停止（成功 / 上限 / 无进展 / 人审）
- 详解：`docs/HARNESS_ENGINEERING.md`、`docs/LOOP_ENGINEERING.md`

## 验证环 / Done

```bash
npm install
npm test          # 若有
npm run build     # 或 build:web
npx cap sync android   # 若有 android/
# 可选：JAVA_HOME=…/openjdk@17 npm run apk:debug
```

**Done 示例**：测试通过（若有）+ web 产物进 `www/`/`dist/` + `cap sync` 无报错。可选穿戴未做可搁置，不纳入强制 Done。
