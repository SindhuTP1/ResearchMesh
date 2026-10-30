import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { ME, LAB_DASHBOARD, UPDATE_LAB, CREATE_LAB, ADD_GRANT, DEPARTMENTS, RESPOND_TO_REQUEST } from '../graphql/operations.js';
import { Loading, ErrorNote, Empty, UserLink, Status, Skills, useToast, errorText, csv, timeAgo } from '../components/ui.jsx';

const money = (n, c = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);

function CreateLab() {
  const { data } = useQuery(DEPARTMENTS);
  const [form, setForm] = useState({ name: '', description: '', departmentId: '', researchAreas: '', capacity: 6, openSlots: 2 });
  const [create, { loading, error }] = useMutation(CREATE_LAB, { refetchQueries: [ME] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="panel stack" onSubmit={(e) => {
      e.preventDefault();
      create({ variables: { input: { ...form, researchAreas: csv(form.researchAreas), capacity: Number(form.capacity), openSlots: Number(form.openSlots) } } }).catch(() => {});
    }}>
      <h3>Set up your lab</h3>
      <p className="faint">Students interested in your areas are notified when you open slots.</p>
      <label className="field">Lab name<input required value={form.name} onChange={set('name')} /></label>
      <label className="field">Description<textarea value={form.description} onChange={set('description')} /></label>
      <div className="form-grid">
        <label className="field">Department
          <select required value={form.departmentId} onChange={set('departmentId')}>
            <option value="">Choose…</option>
            {data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="field">Research areas<input placeholder="nlp, retrieval" value={form.researchAreas} onChange={set('researchAreas')} /></label>
        <label className="field">Capacity<input type="number" min={1} value={form.capacity} onChange={set('capacity')} /></label>
        <label className="field">Open slots<input type="number" min={0} value={form.openSlots} onChange={set('openSlots')} /></label>
      </div>
      <ErrorNote error={error} />
      <div><button className="btn btn-primary" disabled={loading}>Create lab</button></div>
    </form>
  );
}

function SlotsEditor({ lab }) {
  const toast = useToast();
  const [slots, setSlots] = useState(lab.openSlots);
  const [update, { loading }] = useMutation(UPDATE_LAB);
  const changed = Number(slots) !== lab.openSlots;
  return (
    <form className="row" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await update({ variables: { id: lab.id, input: { openSlots: Number(slots) } } });
        toast({ kind: 'ok', title: 'Slots updated', body: Number(slots) > lab.openSlots ? 'Matching students are being notified.' : 'Saved.' });
      } catch (err) { toast({ kind: 'error', title: 'Not saved', body: errorText(err) }); }
    }}>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        Open slots
        <input type="number" min={0} max={lab.capacity} value={slots} onChange={(e) => setSlots(e.target.value)} style={{ width: 80 }} />
      </label>
      <button className="btn btn-sm" disabled={!changed || loading}>Save slots</button>
    </form>
  );
}

function GrantForm({ labId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', agency: '', amount: '', startDate: '', endDate: '' });
  const [add, { loading, error }] = useMutation(ADD_GRANT, { refetchQueries: [LAB_DASHBOARD] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (!open) return <button className="btn btn-sm" onClick={() => setOpen(true)}>Add grant</button>;
  return (
    <form className="stack" style={{ marginTop: 12 }} onSubmit={async (e) => {
      e.preventDefault();
      const r = await add({ variables: { input: { ...form, amount: Number(form.amount), labId } } }).catch(() => null);
      if (r) setOpen(false);
    }}>
      <div className="form-grid">
        <label className="field">Title<input required value={form.title} onChange={set('title')} /></label>
        <label className="field">Agency<input required placeholder="DST-SERB" value={form.agency} onChange={set('agency')} /></label>
        <label className="field">Amount (INR)<input required type="number" min={0} value={form.amount} onChange={set('amount')} /></label>
        <label className="field">Starts<input required type="date" value={form.startDate} onChange={set('startDate')} /></label>
        <label className="field">Ends<input required type="date" value={form.endDate} onChange={set('endDate')} /></label>
      </div>
      <ErrorNote error={error} />
      <div className="row"><button className="btn btn-primary btn-sm" disabled={loading}>Save grant</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function RequestActions({ request, refetch }) {
  const toast = useToast();
  const [respond, { loading }] = useMutation(RESPOND_TO_REQUEST);
  const go = async (accept) => {
    try {
      await respond({ variables: { id: request.id, accept } });
      toast({ kind: 'ok', title: accept ? 'Accepted' : 'Declined', body: `${request.requester.name} has been notified.` });
      refetch?.();
    } catch (e) { toast({ kind: 'error', title: 'Could not respond', body: errorText(e) }); }
  };
  return (
    <div className="row">
      <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => go(true)}>Accept</button>
      <button className="btn btn-sm" disabled={loading} onClick={() => go(false)}>Decline</button>
    </div>
  );
}

export default function MyLab() {
  const { data: me, loading: meLoading } = useQuery(ME);
  const labId = me?.me?.lab?.id;
  const { data, loading, error, refetch } = useQuery(LAB_DASHBOARD, { variables: { id: labId }, skip: !labId });

  if (meLoading) return <Loading />;
  if (!labId) return (<><div className="page-head"><h1>My lab</h1></div><CreateLab /></>);
  if (loading && !data) return <Loading what="Loading dashboard" />;
  if (error) return <ErrorNote error={error} />;
  const lab = data.lab;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{lab.name}</h1>
          <p className="muted">{lab.department.name}. {lab.researchAreas.join(', ')}.</p>
        </div>
        <SlotsEditor lab={lab} key={lab.openSlots} />
      </div>

      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat"><b>{lab.memberCount}</b><span>members of {lab.capacity}</span></div>
        <div className="stat"><b>{lab.openSlots}</b><span>open slots</span></div>
        <div className="stat"><b>{lab.pendingRequests.length}</b><span>pending requests</span></div>
        <div className="stat"><b>{money(lab.totalActiveFunding)}</b><span>active funding</span></div>
      </div>

      <section className="panel">
        <div className="panel-title"><h3>Waiting for your answer</h3><Link to="/students">Find students</Link></div>
        {lab.pendingRequests.length === 0 ? <p className="faint">No pending requests. New ones appear here the moment they're sent.</p> : lab.pendingRequests.map((r) => (
          <div className="request" key={r.id}>
            <div>
              <UserLink user={r.requester} /> <span className="faint">{[...new Set([r.requester.program, r.requester.department?.code].filter(Boolean))].join(', ')}, {timeAgo(r.createdAt)}</span>
              <div className="faint">Wants to join {r.project ? <>the project <strong>{r.project.title}</strong></> : 'the lab'}</div>
              <Skills skills={r.requester.skills} max={6} />
              {r.message && <blockquote>{r.message}</blockquote>}
            </div>
            <RequestActions request={r} refetch={refetch} />
          </div>
        ))}
      </section>

      <div className="two-col" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 10 }}>Members</h3>
          {lab.members.length === 0 ? <Empty><p>No members yet.</p></Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Name</th><th>Program</th><th>Projects</th></tr></thead>
              <tbody>{lab.members.map((m) => (
                <tr key={m.id}>
                  <td><UserLink user={m} /><Skills skills={m.skills} max={4} /></td>
                  <td>{m.program}{m.yearOfStudy ? `, year ${m.yearOfStudy}` : ''}</td>
                  <td>{m.projects.map((p) => <div key={p.id}><Link to={`/projects/${p.id}`}>{p.title}</Link></div>)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <div>
          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Projects</h3>
            {lab.projects.map((p) => (
              <div key={p.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                <Link to={`/projects/${p.id}`}>{p.title}</Link>
                <span className="row"><Status value={p.status} /><span className="faint">{p.members.length} people</span></span>
              </div>
            ))}
            {lab.projects.length === 0 && <p className="faint">No projects yet. <Link to="/projects">Post one</Link>.</p>}
          </section>
          <section className="panel">
            <div className="panel-title"><h3>Grants</h3><GrantForm labId={lab.id} /></div>
            {lab.grants.map((g) => (
              <div key={g.id} className="pub">
                <div className="t">{g.title}</div>
                <div className="faint">{g.agency}, {money(g.amount, g.currency)}, {new Date(g.startDate).getFullYear()}–{new Date(g.endDate).getFullYear()} {g.isActive ? '' : '(ended)'}</div>
              </div>
            ))}
            {lab.grants.length === 0 && <p className="faint">No grants recorded.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
