import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cosine, computeIdf, skillVector, termVector, coverage, recencyScore,
  availabilityScore, rankCandidates, rankStudentsForProject, opportunityFits,
} from '../src/services/matching.js';

const NOW = new Date('2026-10-30');

test('cosine: identical vectors = 1, disjoint = 0', () => {
  assert.equal(Math.round(cosine({ a: 1, b: 1 }, { a: 1, b: 1 }) * 1000) / 1000, 1);
  assert.equal(cosine({ a: 1 }, { b: 1 }), 0);
  assert.equal(cosine({}, { a: 1 }), 0);
});

test('IDF: rare terms weigh more than common terms', () => {
  const corpus = [termVector(['python', 'genomics']), termVector(['python']), termVector(['python']), termVector(['python'])];
  const idf = computeIdf(corpus);
  assert.ok(idf.genomics > idf.python);
});

test('skillVector scales proficiency 1..5 → 0.2..1.0 and keeps max on duplicates', () => {
  const v = skillVector([{ name: 'Python', level: 5 }, { name: 'python', level: 2 }, { name: 'R', level: 1 }]);
  assert.deepEqual(v, { python: 1, r: 0.2 });
});

test('coverage: share of required skills weighted by level', () => {
  const v = skillVector([{ name: 'python', level: 5 }, { name: 'nlp', level: 3 }]);
  assert.equal(coverage(['python', 'nlp', 'docker'], v), (1 + 0.6 + 0) / 3);
  assert.equal(coverage([], v), 0);
});

test('recency: recent publishing beats a long-ago back catalogue', () => {
  const active = recencyScore([2026, 2025], { now: NOW });
  const dormant = recencyScore([2019, 2018, 2017, 2016, 2015, 2014], { now: NOW });
  assert.ok(active > 0.7, `active=${active}`);
  assert.ok(dormant < 0.1, `dormant=${dormant}`);
  assert.equal(recencyScore([], { now: NOW }), 0);
});

test('availability: 0 with no slots, higher with more free capacity', () => {
  assert.equal(availabilityScore({ openSlots: 0, capacity: 5 }), 0);
  assert.ok(availabilityScore({ openSlots: 4, capacity: 5 }) > availabilityScore({ openSlots: 1, capacity: 5 }));
});

test('rankCandidates: active NLP mentor with open slots ranks above dormant NLP and off-topic', () => {
  const seeker = { skills: [{ name: 'python', level: 4 }, { name: 'nlp', level: 3 }], interests: ['nlp', 'large language models'] };
  const candidates = [
    { id: 'offtopic', skills: [{ name: 'python', level: 5 }], interests: ['genomics'], publications: [{ year: 2026, keywords: ['genomics'] }], lab: { openSlots: 4, capacity: 8 } },
    { id: 'dormant', skills: [{ name: 'python', level: 5 }, { name: 'nlp', level: 5 }], interests: ['nlp'], publications: [{ year: 2018, keywords: ['nlp'] }], lab: { openSlots: 0, capacity: 5 } },
    { id: 'active', skills: [{ name: 'python', level: 5 }, { name: 'nlp', level: 5 }], interests: ['nlp', 'large language models'], publications: [{ year: 2026, keywords: ['nlp'] }, { year: 2025, keywords: ['large language models'] }], lab: { openSlots: 2, capacity: 8 } },
  ];
  const ranked = rankCandidates(seeker, candidates, { now: NOW });
  assert.deepEqual(ranked.map((r) => r.id), ['active', 'dormant', 'offtopic']);
  assert.ok(ranked[0].reasons.some((r) => r.includes('nlp')));
  for (const r of ranked) {
    assert.ok(r.score >= 0 && r.score <= 1);
    assert.deepEqual(Object.keys(r.breakdown).sort(), ['availability', 'interest', 'recency', 'skill']);
  }
});

test('rankCandidates: custom weights change the ordering', () => {
  const seeker = { skills: [], interests: ['nlp'] };
  const candidates = [
    { id: 'topic', interests: ['nlp'], publications: [], lab: null },
    { id: 'slots', interests: ['vision'], publications: [{ year: 2026 }], lab: { openSlots: 5, capacity: 5 } },
  ];
  assert.equal(rankCandidates(seeker, candidates, { now: NOW })[0].id, 'topic');
  const ranked = rankCandidates(seeker, candidates, { now: NOW, weights: { interest: 0.05, availability: 0.9 } });
  assert.equal(ranked[0].id, 'slots');
});

test('rankStudentsForProject: coverage of required skills dominates', () => {
  const project = { requiredSkills: ['python', 'genomics'], tags: ['genomics'] };
  const students = [
    { id: 'half', skills: [{ name: 'python', level: 5 }], interests: ['genomics'] },
    { id: 'full', skills: [{ name: 'python', level: 4 }, { name: 'genomics', level: 4 }], interests: [] },
    { id: 'none', skills: [{ name: 'java', level: 5 }], interests: ['web'] },
  ];
  const ranked = rankStudentsForProject(project, students);
  assert.deepEqual(ranked.map((r) => r.id), ['full', 'half', 'none']);
  assert.ok(ranked[1].reasons.includes('Missing: genomics'));
});

test('opportunityFits: matches on interests, rejects unrelated', () => {
  const st = { interests: ['nlp', 'legal ai'], skills: [{ name: 'python', level: 4 }] };
  assert.equal(opportunityFits(st, { areas: ['nlp', 'document ai'] }).fits, true);
  assert.equal(opportunityFits(st, { areas: ['genomics'] }).fits, false);
});
