import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { MY_PROJECTS, UPDATE_PROJECT, DELETE_PROJECT } from '../../graphql/operations.js';
import { NewProject } from '../Projects.jsx';
import { Loading, ErrorNote, Empty, Status, useToast, errorText, timeAgo } from '../../components/ui.jsx';

const STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

function ProjectManageRow({ p }) {
  const toast = useToast();
  const [update, { loading }] = useMutation(UPDATE_PROJECT);
  const [del, { loading: deleting }] = useMutation(DELETE_PROJECT, { refetchQueries: [MY_PROJECTS] });
  const save = (input) => update({ variables: { id: p.id, input } }).catch((e) => toast({ kind: 'error', title: 'Not saved', body: errorText(e) }));
  return (
    <tr>
      <td>
        <Link to={`/projects/${p.id}`} className="serif" style={{ fontWeight: 600 }}>{p.title}</Link>
        <div className="faint">{p.lab?.name ?? 'Independent'} · posted {timeAgo(p.createdAt)}</div>
        <div className="chips">{p.requiredSkills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
      </td>
      <td>
        <select aria-label={`Status of ${p.title}`} value={p.status} disabled={loading} style={{ width: 'auto' }} onChange={(e) => save({ status: e.target.value })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </select>
      </td>
      <td>{p.members.length}/{p.maxMembers}<div className="faint">{p.seatsLeft} free</div></td>
      <td>
        <label className="check"><input type="checkbox" checked={p.isOpen} disabled={loading} onChange={(e) => save({ isOpen: e.target.checked })} />{p.isOpen ? 'Open' : 'Closed'}</label>
      </td>
      <td>
        <div className="row">
          <Link className="btn btn-sm" to={`/projects/${p.id}`}>Find students</Link>
          <button className="btn btn-ghost btn-sm btn-danger" disabled={deleting} onClick={() => {
            if (window.confirm(`Delete "${p.title}"? Pending requests to it are withdrawn.`)) del({ variables: { id: p.id } }).catch((e) => toast({ kind: 'error', title: 'Not deleted', body: errorText(e) }));
          }}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

export default function MyProjects() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [filter, setFilter] = useState('ALL');
  const { data, loading, error } = useQuery(MY_PROJECTS, { fetchPolicy: 'cache-and-network' });
  const all = data?.projects ?? [];
  const list = filter === 'ALL' ? all : filter === 'OPEN' ? all.filter((p) => p.isOpen) : all.filter((p) => p.status === filter);
  const done = () => { setCreating(false); setParams({}, { replace: true }); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My projects</h1>
          <p className="muted">Projects you lead. Open ones are shown to students, and students whose skills fit are notified when you post or reopen.</p>
        </div>
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>Post a project</button>}
      </div>
      {creating && <div style={{ marginBottom: 20 }}><NewProject onDone={done} stay /></div>}

      <div className="row" role="tablist" style={{ marginBottom: 12 }}>
        {[['ALL', 'All'], ['OPEN', 'Taking members'], ...STATUSES.map((s) => [s, s.replace('_', ' ').toLowerCase()])].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={filter === v} className={`btn btn-sm ${filter === v ? 'btn-primary' : ''}`} onClick={() => setFilter(v)}>
            {l} <span className="faint" style={{ color: 'inherit', opacity: 0.7 }}>{v === 'ALL' ? all.length : v === 'OPEN' ? all.filter((p) => p.isOpen).length : all.filter((p) => p.status === v).length}</span>
          </button>
        ))}
      </div>

      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && all.length === 0 && !creating && <Empty><p>You haven't posted any projects yet.</p><p><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Post your first project</button></p></Empty>}
      {list.length > 0 && (
        <section className="panel" style={{ padding: 0 }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Project</th><th>Status</th><th>Team</th><th>Members</th><th /></tr></thead>
            <tbody>{list.map((p) => <ProjectManageRow key={p.id} p={p} />)}</tbody>
          </table></div>
        </section>
      )}
      {data && all.length > 0 && list.length === 0 && <p className="faint">No projects in this view.</p>}
      <p className="faint" style={{ marginTop: 12 }}><Status value="ACTIVE" /> projects with seats left are what students see first.</p>
    </>
  );
}
