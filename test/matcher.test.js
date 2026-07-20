import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  containsTerm,
  extractRequirements,
  extractCvSkills,
  classifyRequirement,
  matchCvToJd,
  buildRewriteHints,
} from '../src/matcher.js';
import { rewriteRuleBased, parseSections } from '../src/rewrite.js';
import { extractJsonObject } from '../src/llm.js';
import { unescapePdfString } from '../src/pdf-text.js';

describe('normalizeText / containsTerm', () => {
  it('normalizes case and whitespace', () => {
    assert.equal(normalizeText('  Foo   BAR '), 'foo bar');
  });

  it('matches latin terms on word boundaries', () => {
    assert.equal(containsTerm(normalizeText('I use React and Node.js'), 'react'), true);
    assert.equal(containsTerm(normalizeText('reaction time'), 'react'), false);
  });

  it('matches CJK substrings', () => {
    assert.equal(containsTerm(normalizeText('熟悉微服务架构'), '微服务'), true);
  });
});

describe('extractRequirements', () => {
  it('pulls bullets from Requirements section and lexicon', () => {
    const jd = `
Software Engineer

Requirements:
- 3+ years of experience with React and TypeScript
- Strong knowledge of PostgreSQL
- Kubernetes experience preferred

Responsibilities:
- Build APIs
`;
    const reqs = extractRequirements(jd);
    assert.ok(reqs.some((r) => /react/i.test(r)));
    assert.ok(reqs.some((r) => /typescript/i.test(r) || /postgresql/i.test(r)));
    assert.ok(reqs.some((r) => /kubernetes/i.test(r)));
  });

  it('handles Chinese 任职要求', () => {
    const jd = `
任职要求：
- 熟悉 Python 与 FastAPI
- 有微服务经验

工作内容：
- 开发后端
`;
    const reqs = extractRequirements(jd);
    assert.ok(reqs.some((r) => /python|fastapi|微服务/i.test(r)));
  });
});

describe('matchCvToJd', () => {
  const cv = `
# Jane Doe

## Summary
Backend engineer with Python and FastAPI.

## Skills
Python, FastAPI, PostgreSQL, Docker, Redis

## Experience
Acme Corp — Backend Engineer (2020-2024)
- Built microservices with FastAPI and PostgreSQL
- Containerized services with Docker
`;

  const jd = `
Requirements:
- Python and FastAPI
- PostgreSQL
- Kubernetes
- 5+ years experience
`;

  it('scores and buckets matched / missing / weak', () => {
    const r = matchCvToJd(cv, jd);
    assert.ok(r.score >= 40 && r.score <= 100);
    assert.ok(r.matched.some((m) => /python|fastapi|postgresql/i.test(m)));
    assert.ok(r.missing.some((m) => /kubernetes/i.test(m)));
    assert.ok(Array.isArray(r.rewriteHints) && r.rewriteHints.length > 0);
  });

  it('extracts CV skills from lexicon', () => {
    const skills = extractCvSkills(cv);
    assert.ok(skills.some((s) => /python/i.test(s)));
    assert.ok(skills.some((s) => /docker/i.test(s)));
  });
});

describe('classifyRequirement', () => {
  it('marks present skills matched', () => {
    const cv = 'Experienced with React and TypeScript';
    assert.equal(classifyRequirement('React', normalizeText(cv), cv), 'matched');
  });

  it('marks absent skills missing', () => {
    const cv = 'Experienced with React';
    assert.equal(classifyRequirement('Kubernetes', normalizeText(cv), cv), 'missing');
  });
});

describe('buildRewriteHints', () => {
  it('mentions honesty for missing skills', () => {
    const hints = buildRewriteHints({
      matched: ['React'],
      missing: ['Kubernetes'],
      weak: [],
    });
    assert.ok(hints.some((h) => /do not invent/i.test(h)));
  });
});

describe('rewriteRuleBased', () => {
  it('does not invent employers and reorders skills', () => {
    const cv = `Alex Lee

## Skills
Word, Excel, Python

## Experience
Beta Inc — Engineer (2019-2023)
- Shipped Python APIs
`;
    const jd = 'Requirements:\n- Python\n- Kubernetes\n';
    const out = rewriteRuleBased(cv, jd);
    assert.equal(out.mode, 'rules');
    assert.ok(out.tailoredResume.includes('Beta Inc'));
    assert.ok(!/Gamma Corp|Invented|Fictional/i.test(out.tailoredResume));
    assert.ok(out.gaps.some((g) => /kubernetes/i.test(g)));
    assert.ok(out.edits.length > 0);
  });

  it('parseSections finds skills and experience', () => {
    const secs = parseSections('## Skills\nGo\n\n## Experience\nFoo');
    assert.ok(secs.some((s) => s.id === 'skills'));
    assert.ok(secs.some((s) => s.id === 'experience'));
  });
});

describe('llm helpers', () => {
  it('extractJsonObject pulls fenced JSON', () => {
    const obj = extractJsonObject('Here:\n```json\n{"score":10}\n```');
    assert.equal(JSON.parse(obj).score, 10);
  });
});

describe('pdf-text helpers', () => {
  it('unescapes PDF literal strings', () => {
    assert.equal(unescapePdfString('(Hello \\(World\\))'), 'Hello (World)');
  });
});
