import { useEffect, useState } from 'react';
import { reducedMotion } from './ui.jsx';

/** Words that type themselves out and swap: "Find people working on n|lp → cloud → devops…" */
export function Typewriter({ words }) {
  const list = words.length ? words : ['research'];
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const word = list[i % list.length];

  useEffect(() => {
    if (reducedMotion()) return undefined;
    const done = !deleting && n === word.length;
    const empty = deleting && n === 0;
    const t = setTimeout(() => {
      if (done) setDeleting(true);
      else if (empty) { setDeleting(false); setI((x) => x + 1); }
      else setN((x) => x + (deleting ? -1 : 1));
    }, done ? 1600 : empty ? 250 : deleting ? 35 : 70);
    return () => clearTimeout(t);
  }, [n, deleting, word]);

  if (reducedMotion()) return <span className="typed">{list.slice(0, 3).join(', ')}</span>;
  return <span className="typed" aria-label={list.join(', ')}>{word.slice(0, n)}<span className="caret" aria-hidden="true" /></span>;
}

/** Floating network of dots behind the dashboard greeting. Pure decoration. */
function Drift() {
  const dots = [[8, 30], [22, 70], [38, 25], [55, 60], [70, 20], [84, 55], [94, 30], [62, 85], [15, 88]];
  return (
    <svg className="hero-drift" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {dots.slice(0, -1).map(([x, y], k) => <line key={k} x1={x} y1={y} x2={dots[k + 1][0]} y2={dots[k + 1][1]} />)}
      {dots.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={k % 3 === 0 ? 1.6 : 1.1} style={{ animationDelay: `${k * 0.6}s` }} className={k % 4 === 1 ? 'amber' : ''} />)}
    </svg>
  );
}

export default function Hero({ title, sub, words = [], lead = 'Working on', children }) {
  return (
    <section className="hero">
      <Drift />
      <div className="hero-body">
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {words.length > 0 && <p className="hero-line">{lead} <Typewriter words={words} /></p>}
      </div>
      {children && <div className="hero-actions">{children}</div>}
    </section>
  );
}
