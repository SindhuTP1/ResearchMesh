/**
 * The match score, broken into the weighted parts that produced it.
 * Each segment's width = weight × component score, so the bar's total length IS the score.
 */
export const COMPONENTS = [
  { key: 'skill', label: 'Skills', color: 'var(--m-skill)' },
  { key: 'interest', label: 'Interests', color: 'var(--m-interest)' },
  { key: 'recency', label: 'Active recently', color: 'var(--m-recency)' },
  { key: 'availability', label: 'Open slots', color: 'var(--m-availability)' },
];

export const DEFAULT_WEIGHTS = { skill: 0.4, interest: 0.35, recency: 0.15, availability: 0.1 };

export default function MatchBar({ score, breakdown, weights = DEFAULT_WEIGHTS, reasons = [] }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const pct = Math.round(score * 100);
  return (
    <div>
      <div className="match">
        <div className="match-score" aria-label={`Match ${pct} percent`}>
          {pct}<small>%</small>
        </div>
        <div>
          <div className="match-bar" role="img" aria-label={COMPONENTS.map((c) => `${c.label} ${Math.round((breakdown?.[c.key] ?? 0) * 100)}%`).join(', ')}>
            {COMPONENTS.map((c) => (
              <span
                key={c.key}
                style={{ width: `${((weights[c.key] ?? 0) / total) * (breakdown?.[c.key] ?? 0) * 100}%`, background: c.color }}
                title={`${c.label}: ${Math.round((breakdown?.[c.key] ?? 0) * 100)}%`}
              />
            ))}
          </div>
          <div className="match-legend">
            {COMPONENTS.filter((c) => (weights[c.key] ?? 0) > 0).map((c) => (
              <span key={c.key} style={{ '--c': c.color }}>
                {c.label} {Math.round((breakdown?.[c.key] ?? 0) * 100)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
