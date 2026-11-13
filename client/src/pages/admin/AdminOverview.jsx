import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { ADMIN_OVERVIEW } from '../../graphql/operations.js';
import { Loading, ErrorNote, Status, Stat, Meter, UserLink, timeAgo } from '../../components/ui.jsx';
import Hero from '../../components/Hero.jsx';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function AdminOverview() {
  const { data, loading, error } = useQuery(ADMIN_OVERVIEW, { fetchPolicy: 'cache-and-network' });
  if (loading && !data) return <Loading what="Loading platform overview" />;
  if (error && !data) return <ErrorNote error={error} />;
  const { adminStats: s, departmentStats: depts, recentJoinRequests: recent } = data;
  const decided = s.requests.accepted + s.requests.rejected;
  const funnel = [
    ['Pending', s.requests.pending, 'var(--amber)'],
    ['Accepted', s.requests.accepted, 'var(--moss)'],
    ['Declined', s.requests.rejected, 'var(--rose)'],
    ['Withdrawn', s.requests.withdrawn, 'var(--faint)'],
  ];
  const funnelMax = Math.max(1, ...funnel.map(([, n]) => n));

  return (
    <>
      <Hero title="Platform overview" sub="Who's on ResearchMesh, where there is room, and what needs an admin." words={depts.map((d) => d.department.name)} lead="Keeping an eye on" />

      {s.pendingVerifications > 0 && (
        <div className="banner">
          <b>{s.pendingVerifications} faculty {s.pendingVerifications === 1 ? 'account is' : 'accounts are'} waiting for verification.</b>{' '}
          <Link to="/admin/verifications">Review now</Link>
        </div>
      )}

      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat value={s.users} label="people" to="/admin/users" />
        <Stat value={s.students} label="students" to="/admin/users?role=STUDENT" />
        <Stat value={s.faculty} label="faculty" to="/admin/users?role=FACULTY" />
        <Stat value={s.activeResearchers} label={`actively publishing (${pct(s.activeResearchers, s.faculty)}%)`} />
        <Stat value={s.labs} label="labs" to="/admin/projects" />
        <Stat value={s.openProjects} label="open projects" to="/admin/projects" />
        <Stat value={s.pendingVerifications} label="awaiting verification" to="/admin/verifications" tone={s.pendingVerifications ? 'attention' : ''} />
        <Stat value={s.unattachedStudents} label="students without a lab" />
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-title"><h3>Departments</h3><Link to="/admin/departments">Manage</Link></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Department</th><th>Faculty</th><th>Active</th><th>Students</th><th>Labs</th><th>Open slots</th><th>Open projects</th></tr></thead>
            <tbody>{depts.map((d) => (
              <tr key={d.department.id}>
                <td><strong>{d.department.code}</strong><div className="faint">{d.department.name}</div></td>
                <td>{d.faculty}</td>
                <td>{d.activeResearchers}</td>
                <td>{d.students}</td>
                <td>{d.labs}</td>
                <td>{d.openSlots > 0 ? <strong style={{ color: 'var(--moss-ink)' }}>{d.openSlots}</strong> : <span className="faint">0</span>}</td>
                <td>{d.openProjects}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>

        <aside>
          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Lab capacity</h3>
            <Meter value={s.totalCapacity ? s.filledSeats / s.totalCapacity : 0} label="Lab seats filled" />
            <p className="faint" style={{ marginTop: 8 }}>{s.filledSeats} of {s.totalCapacity} lab seats filled ({pct(s.filledSeats, s.totalCapacity)}%).</p>
          </section>

          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Join requests</h3>
            <div className="year-bars">
              {funnel.map(([label, n, c]) => (
                <div key={label} className="year-bar">
                  <span className="y">{label}</span>
                  <span className="track"><span style={{ width: `${(n / funnelMax) * 100}%`, background: c }} /></span>
                  <span className="n">{n}</span>
                </div>
              ))}
            </div>
            <p className="faint" style={{ marginTop: 8 }}>{decided ? `${pct(s.requests.accepted, decided)}% of decided requests were accepted.` : 'No decisions yet.'}</p>
          </section>

          <section className="panel">
            <h3 style={{ marginBottom: 6 }}>Recent activity</h3>
            {recent.length === 0 && <p className="faint">No join requests yet.</p>}
            {recent.map((r) => (
              <div key={r.id} className="list-row spread">
                <div>
                  <UserLink user={r.requester} /> <span className="faint">→</span> {r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.title}</Link> : <strong>{r.lab?.name}</strong>}
                  <div className="faint">{timeAgo(r.createdAt)}</div>
                </div>
                <Status value={r.status} />
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
