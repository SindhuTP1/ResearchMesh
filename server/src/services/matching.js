/**
 * ResearchMesh matching engine
 * ----------------------------
 * Pure functions (no DB access) so they are easy to unit-test and reason about.
 *
 * Every candidate gets a final score in [0, 1] built from four explainable components:
 *
 *   score = wSkill * skillSimilarity      // IDF-weighted cosine over skill vectors (weighted by proficiency)
 *         + wInterest * interestSimilarity // IDF-weighted cosine over interests (+ recent publication keywords)
 *         + wRecency * recencyScore        // how *currently* active the person is (publications decay over time)
 *         + wAvailability * availability   // open lab slots / open project seats
 *
 * IDF weighting means a shared rare skill ("genomics") counts more than a shared common one ("python"),
 * which is what a human would expect from a good match.
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  skill: 0.4,
  interest: 0.35,
  recency: 0.15,
  availability: 0.1,
});

const norm = (s) => String(s).toLowerCase().trim();

/** Build a sparse vector {term: weight} from skills [{name, level}] — level 1..5 → 0.2..1.0 */
export function skillVector(skills = []) {
  const v = {};
  for (const s of skills) {
    if (!s) continue;
    const name = norm(typeof s === 'string' ? s : s.name);
    const level = typeof s === 'string' ? 3 : s.level ?? 3;
    v[name] = Math.max(v[name] ?? 0, level / 5);
  }
  return v;
}

/** Build a sparse vector from plain terms (interests, keywords, required skills). Repeated terms add up. */
export function termVector(terms = [], weight = 1) {
  const v = {};
  for (const t of terms) {
    if (!t) continue;
    const k = norm(t);
    v[k] = (v[k] ?? 0) + weight;
  }
  return v;
}

export function mergeVectors(...vectors) {
  const out = {};
  for (const v of vectors) for (const [k, w] of Object.entries(v)) out[k] = (out[k] ?? 0) + w;
  return out;
}

/**
 * Inverse document frequency over a corpus of vectors.
 * Smoothed: idf = ln((N + 1) / (df + 1)) + 1  → always > 0, rare terms get bigger weights.
 */
export function computeIdf(corpus) {
  const df = {};
  for (const vec of corpus) for (const term of Object.keys(vec)) df[term] = (df[term] ?? 0) + 1;
  const N = corpus.length;
  const idf = {};
  for (const [term, d] of Object.entries(df)) idf[term] = Math.log((N + 1) / (d + 1)) + 1;
  return idf;
}

/** Cosine similarity between two sparse vectors, optionally IDF-weighted. Returns [0, 1]. */
export function cosine(a, b, idf = null) {
  const w = (term) => (idf ? idf[term] ?? 1 : 1);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, x] of Object.entries(a)) {
    const xa = x * w(t);
    na += xa * xa;
    if (t in b) dot += xa * b[t] * w(t);
  }
  for (const [t, y] of Object.entries(b)) {
    const yb = y * w(t);
    nb += yb * yb;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Coverage: how many of the *required* terms does the candidate have, weighted by proficiency.
 * Used for project matching where the project lists exact required skills.
 */
export function coverage(required, candidateSkillVec) {
  const req = [...new Set(required.map(norm))];
  if (!req.length) return 0;
  const sum = req.reduce((acc, r) => acc + (candidateSkillVec[r] ?? 0), 0);
  return sum / req.length;
}

/**
 * Recency: exponential decay on publication age + bonus for volume in the last `windowYears`.
 * A faculty member whose last paper was 5 years ago scores low even with many old papers.
 */
export function recencyScore(publicationYears = [], { now = new Date(), windowYears = 2, halfLife = 2 } = {}) {
  if (!publicationYears.length) return 0;
  const year = now.getFullYear();
  const latest = Math.max(...publicationYears);
  const age = Math.max(0, year - latest);
  const decay = Math.pow(0.5, age / halfLife); // 1.0 if published this year, 0.5 after `halfLife` years
  const recentCount = publicationYears.filter((y) => year - y <= windowYears).length;
  const volume = 1 - Math.exp(-recentCount / 2); // 1 paper ≈ 0.39, 3 ≈ 0.78, saturates near 1
  return 0.6 * decay + 0.4 * volume;
}

export function availabilityScore({ openSlots = 0, capacity = 1 } = {}) {
  if (openSlots <= 0) return 0;
  return Math.min(1, 0.5 + 0.5 * (openSlots / Math.max(1, capacity)));
}

const round = (x) => Math.round(x * 1000) / 1000;

function sharedTerms(a, b, idf, limit = 5) {
  return Object.keys(a)
    .filter((t) => t in b)
    .sort((x, y) => (idf?.[y] ?? 1) - (idf?.[x] ?? 1))
    .slice(0, limit);
}

/**
 * Rank candidate mentors / collaborators for a seeker.
 *
 * @param {object} seeker      { skills:[{name,level}], interests:[string] }
 * @param {object[]} candidates [{ id, skills, interests, publications:[{year, keywords}], lab:{openSlots,capacity} }]
 * @param {object} opts         { weights, limit, minScore, now }
 * @returns {object[]} sorted [{ id, score, breakdown:{skill,interest,recency,availability}, reasons:[string] }]
 */
export function rankCandidates(seeker, candidates, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0;

  const seekerSkills = skillVector(seeker.skills);
  const seekerInterests = termVector(seeker.interests);

  // Candidate interest profile = declared interests + keywords from *recent* publications (last 3 yrs).
  const prepared = candidates.map((c) => {
    const recentKeywords = (c.publications || [])
      .filter((p) => now.getFullYear() - p.year <= 3)
      .flatMap((p) => p.keywords || []);
    return {
      raw: c,
      skills: skillVector(c.skills),
      interests: mergeVectors(termVector(c.interests), termVector(recentKeywords, 0.5)),
      years: (c.publications || []).map((p) => p.year),
    };
  });

  const skillIdf = computeIdf([seekerSkills, ...prepared.map((p) => p.skills)]);
  const interestIdf = computeIdf([seekerInterests, ...prepared.map((p) => p.interests)]);

  const results = prepared.map((p) => {
    const breakdown = {
      skill: cosine(seekerSkills, p.skills, skillIdf),
      interest: cosine(seekerInterests, p.interests, interestIdf),
      recency: recencyScore(p.years, { now }),
      availability: p.raw.lab ? availabilityScore(p.raw.lab) : 0,
    };
    const score =
      weights.skill * breakdown.skill +
      weights.interest * breakdown.interest +
      weights.recency * breakdown.recency +
      weights.availability * breakdown.availability;

    const reasons = [];
    const si = sharedTerms(seekerInterests, p.interests, interestIdf);
    const ss = sharedTerms(seekerSkills, p.skills, skillIdf);
    if (si.length) reasons.push(`Shared interests: ${si.join(', ')}`);
    if (ss.length) reasons.push(`Shared skills: ${ss.join(', ')}`);
    if (breakdown.recency >= 0.6) reasons.push('Actively publishing (last 2 years)');
    if (breakdown.availability > 0) reasons.push(`Lab has ${p.raw.lab.openSlots} open slot(s)`);

    return {
      id: String(p.raw.id),
      score: round(score),
      breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, round(v)])),
      reasons,
    };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Rank students for a project: required-skill coverage dominates, interest↔tag similarity second.
 */
export function rankStudentsForProject(project, students, opts = {}) {
  const limit = opts.limit ?? 10;
  const tagVec = termVector([...(project.tags || []), ...(project.requiredSkills || [])]);
  // Topical profile = declared interests + skill names, so a student who *has* the skills isn't
  // out-ranked by one who merely lists the topic as an interest.
  const prepared = students.map((s) => ({
    raw: s,
    skills: skillVector(s.skills),
    interests: mergeVectors(termVector(s.interests), termVector((s.skills || []).map((k) => k.name ?? k))),
  }));
  const idf = computeIdf([tagVec, ...prepared.map((p) => p.interests)]);

  return prepared
    .map((p) => {
      const cov = coverage(project.requiredSkills || [], p.skills);
      const interest = cosine(tagVec, p.interests, idf);
      const score = 0.7 * cov + 0.3 * interest;
      const have = (project.requiredSkills || []).filter((r) => norm(r) in p.skills);
      const missing = (project.requiredSkills || []).filter((r) => !(norm(r) in p.skills));
      const reasons = [];
      if (have.length) reasons.push(`Has: ${have.join(', ')}`);
      if (missing.length) reasons.push(`Missing: ${missing.join(', ')}`);
      return {
        id: String(p.raw.id),
        score: round(score),
        breakdown: { skill: round(cov), interest: round(interest), recency: 0, availability: 0 },
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Quick check used by the "matching opening" notifier: does a new lab/project fit this student? */
export function opportunityFits(student, { areas = [], requiredSkills = [] }, threshold = 0.25) {
  const interestSim = cosine(termVector(student.interests), termVector(areas));
  const cov = coverage(requiredSkills, skillVector(student.skills));
  const score = requiredSkills.length ? 0.5 * interestSim + 0.5 * cov : interestSim;
  return { fits: score >= threshold, score: round(score) };
}
