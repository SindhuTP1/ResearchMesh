import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { MY_PUBLICATIONS } from '../../graphql/operations.js';
import { AddPublication } from '../Profile.jsx';
import { Loading, ErrorNote, Empty, Stat } from '../../components/ui.jsx';

const THIS_YEAR = new Date().getFullYear();

/** A faculty member's publication record — what drives "actively publishing" in every student search. */
export default function Publications() {
  const { data, loading, error } = useQuery(MY_PUBLICATIONS, { fetchPolicy: 'cache-and-network' });
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} />;
  const me = data.me;
  const pubs = me.publications;
  const years = [...new Set(pubs.map((p) => p.year))].sort((a, b) => b - a);
  const venues = new Set(pubs.map((p) => p.venue).filter(Boolean));
  const latest = pubs[0]?.year;
  const needle = q.trim().toLowerCase();
  const list = pubs.filter((p) => (!year || p.year === Number(year)) && (!needle || `${p.title} ${p.venue} ${p.keywords.join(' ')}`.toLowerCase().includes(needle)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Publications</h1>
          <p className="muted">Students filter faculty by papers in the last 2 years, and recent keywords feed your match score. Keep this current.</p>
        </div>
        <AddPublication userId={me.id} refetchQueries={[MY_PUBLICATIONS, 'FacultyDashboard']} />
      </div>

      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat value={me.publicationCount} label="publications" />
        <Stat value={me.recentPublicationCount} label="in the last 2 years" tone={me.recentPublicationCount ? '' : 'attention'} />
        <Stat value={latest ?? '—'} label="most recent" />
        <Stat value={venues.size} label="venues" />
      </div>

      {latest != null && THIS_YEAR - latest > 2 && (
        <div className="banner">Your newest listed paper is from {latest}. Students who tick “published in the last 2 years” won't see you until you add something recent.</div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ maxWidth: 280 }} placeholder="Search title, venue or keyword" aria-label="Search publications" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {pubs.length === 0 ? <Empty><p>No publications yet. Add your recent work so students can find you.</p></Empty> : (
        <section className="panel">
          {list.length === 0 && <p className="faint">Nothing matches.</p>}
          {list.map((p) => (
            <div className="pub" key={p.id}>
              <div><span className={`yr ${THIS_YEAR - p.year > 2 ? 'old' : ''}`}>{p.year}</span><span className="t">{p.title}</span></div>
              <div className="faint">{[p.venue, [...p.authors.map((a) => a.name), ...p.externalAuthors].join(', ')].filter(Boolean).join(' · ')}</div>
              {p.keywords.length > 0 && <div className="chips">{p.keywords.map((k) => <span key={k} className="chip interest">{k}</span>)}</div>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
