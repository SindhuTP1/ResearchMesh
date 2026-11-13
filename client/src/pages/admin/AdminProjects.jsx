import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { ADMIN_PROJECTS_LABS, UPDATE_PROJECT, DELETE_PROJECT } from '../../graphql/operations.js';
import { Loading, ErrorNote, Status, Meter, UserLink, useToast, errorText, timeAgo } from '../../components/ui.jsx';

/** Moderation view: every project and lab on the platform. */
export default function AdminProjects() {
  const toast = useToast();
  const [tab, setTab] = useState('projects');
  const [q, setQ] = useState('');
  const { data, loading, error } = useQuery(ADMIN_PROJECTS_LABS, { fetchPolicy: 'cache-and-network' });
  const [update] = useMutation(UPDATE_PROJECT);
  const [del] = useMutation(DELETE_PROJECT, { refetchQueries: [ADMIN_PROJECTS_LABS] });
  const fail = (title) => (e) => toast({ kind: 'error', title, body: errorText(e) });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} />;
  const needle = q.trim().toLowerCase();
  const projects = data.projects.filter((p) => !needle || `${p.title} ${p.owner.name} ${p.lab?.name ?? ''}`.toLowerCase().includes(needle));
  const labs = data.labs.filter((l) => !needle || `${l.name} ${l.head.name} ${l.department.code}`.toLowerCase().includes(needle));

  return (
    <>
      <div className="page-head"><div><h1>Projects & labs</h1><p className="muted">Close projects that have gone stale, remove inappropriate ones, and watch lab capacity.</p></div></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="row" role="tablist">
          {[['projects', `Projects (${data.projects.length})`], ['labs', `Labs (${data.labs.length})`]].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} className={`btn btn-sm ${tab === v ? 'btn-primary' : ''}`} onClick={() => setTab(v)}>{l}</button>
          ))}
        </div>
        <input style={{ maxWidth: 260 }} placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tab === 'projects' ? (
        <section className="panel" style={{ padding: 0 }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Team</th><th>Created</th><th /></tr></thead>
            <tbody>{projects.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/projects/${p.id}`}>{p.title}</Link><div className="faint">{p.lab?.name ?? 'Independent'}</div></td>
                <td><UserLink user={p.owner} /><div className="faint">{p.owner.role.toLowerCase()}</div></td>
                <td><Status value={p.status} /><div className="faint">{p.isOpen ? 'taking members' : 'closed'}</div></td>
                <td>{p.members.length}/{p.maxMembers}</td>
                <td className="faint">{timeAgo(p.createdAt)}</td>
                <td>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => update({ variables: { id: p.id, input: { isOpen: !p.isOpen } } }).catch(fail('Not saved'))}>{p.isOpen ? 'Close' : 'Reopen'}</button>
                    <button className="btn btn-ghost btn-sm btn-danger" onClick={() => {
                      if (window.confirm(`Delete "${p.title}"?`)) del({ variables: { id: p.id } }).catch(fail('Not deleted'));
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ) : (
        <section className="panel" style={{ padding: 0 }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Lab</th><th>Head</th><th>Dept</th><th style={{ minWidth: 160 }}>Members / capacity</th><th>Open slots</th></tr></thead>
            <tbody>{labs.map((l) => (
              <tr key={l.id}>
                <td className="serif" style={{ fontWeight: 600 }}>{l.name}</td>
                <td><UserLink user={l.head} /></td>
                <td>{l.department.code}</td>
                <td><Meter value={l.memberCount / l.capacity} label={`${l.name} fill`} /><div className="faint">{l.memberCount} of {l.capacity}</div></td>
                <td>{l.openSlots > 0 ? <strong style={{ color: 'var(--moss-ink)' }}>{l.openSlots}</strong> : <span className="faint">Full</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
