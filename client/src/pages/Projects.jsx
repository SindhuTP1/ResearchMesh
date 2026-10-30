import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { PROJECTS, CREATE_PROJECT, REQUEST_TO_JOIN, ME } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, ErrorNote, Empty, Status, useToast, errorText, csv } from '../components/ui.jsx';

export function JoinButton({ project }) {
  const { user } = useAuth();
  const toast = useToast();
  const [join, { loading }] = useMutation(REQUEST_TO_JOIN);
  if (project.owner.id === user?.id) return <span className="faint">You own this</span>;
  if (project.myRequestStatus === 'PENDING') return <Status value="PENDING" />;
  if (project.myRequestStatus === 'ACCEPTED') return <Status value="ACCEPTED" />;
  if (!project.isOpen || project.seatsLeft === 0) return <span className="faint">Not accepting members</span>;
  return (
    <button
      className="btn btn-primary btn-sm"
      disabled={loading}
      onClick={async () => {
        try {
          await join({ variables: { targetType: 'PROJECT', targetId: project.id } });
          toast({ kind: 'ok', title: 'Request sent', body: `${project.owner.name} will be notified right away.` });
        } catch (e) {
          toast({ kind: 'error', title: 'Request not sent', body: errorText(e) });
        }
      }}
    >
      Request to join
    </button>
  );
}

function ProjectCard({ p }) {
  return (
    <article className="project">
      <div className="spread">
        <Status value={p.status} />
        <span className="faint">{p.seatsLeft} of {p.maxMembers} seats left</span>
      </div>
      <h3><Link to={`/projects/${p.id}`}>{p.title}</Link></h3>
      <p className="muted" style={{ fontSize: '0.9rem' }}>{p.description}</p>
      <div className="chips">
        {p.requiredSkills.map((s) => <span key={s} className="chip">{s}</span>)}
        {p.tags.map((t) => <span key={t} className="chip interest">{t}</span>)}
      </div>
      <div className="foot">
        <span className="faint">{p.owner.name}{p.lab ? `, ${p.lab.name}` : ''}</span>
        <JoinButton project={p} />
      </div>
    </article>
  );
}

function NewProject({ onDone }) {
  const navigate = useNavigate();
  const { data: meData } = useQuery(ME);
  const [form, setForm] = useState({ title: '', description: '', requiredSkills: '', tags: '', maxMembers: 5, inLab: true });
  const [create, { loading, error }] = useMutation(CREATE_PROJECT, { refetchQueries: [PROJECTS] });
  const myLab = meData?.me?.lab;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const { data } = await create({
          variables: {
            input: {
              title: form.title, description: form.description, requiredSkills: csv(form.requiredSkills),
              tags: csv(form.tags), maxMembers: Number(form.maxMembers), isOpen: true,
              labId: form.inLab && myLab ? myLab.id : null,
            },
          },
        }).catch(() => ({}));
        if (data) { onDone(); navigate(`/projects/${data.createProject.id}`); }
      }}
    >
      <h3>New project</h3>
      <p className="faint">Students whose interests and skills fit will get a notification as soon as you post.</p>
      <label className="field">Title<input required value={form.title} onChange={set('title')} /></label>
      <label className="field">What you're working on<textarea value={form.description} onChange={set('description')} /></label>
      <div className="form-grid">
        <label className="field">Required skills<input placeholder="python, pytorch" value={form.requiredSkills} onChange={set('requiredSkills')} /></label>
        <label className="field">Topics<input placeholder="nlp, legal ai" value={form.tags} onChange={set('tags')} /></label>
        <label className="field">Team size<input type="number" min={1} max={30} value={form.maxMembers} onChange={set('maxMembers')} /></label>
      </div>
      {myLab && (
        <label className="check"><input type="checkbox" checked={form.inLab} onChange={(e) => setForm({ ...form, inLab: e.target.checked })} />Run it in {myLab.name}</label>
      )}
      <ErrorNote error={error} />
      <div className="row">
        <button className="btn btn-primary" disabled={loading}>Post project</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function Projects() {
  const [tag, setTag] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [creating, setCreating] = useState(false);
  const { data, loading, error } = useQuery(PROJECTS, { variables: { openOnly, tag: tag.trim() || null } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">Open research projects across all labs. Request to join and the owner hears about it instantly.</p>
        </div>
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>Post a project</button>}
      </div>
      {creating && <div style={{ marginBottom: 20 }}><NewProject onDone={() => setCreating(false)} /></div>}
      <div className="row" style={{ marginBottom: 16 }}>
        <input style={{ maxWidth: 260 }} placeholder="Filter by skill or topic" aria-label="Filter by skill or topic" value={tag} onChange={(e) => setTag(e.target.value)} />
        <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />Only projects taking members</label>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data?.projects.length === 0 && <Empty><p>No projects match. Clear the filter or post one yourself.</p></Empty>}
      <div className="project-list">{data?.projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
    </>
  );
}
