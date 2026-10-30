import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { LOGIN, REGISTER, DEPARTMENTS } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorNote } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';

function MeshArt() {
  // Decorative network: nodes = people, edges = shared interests.
  const nodes = [[60, 80], [180, 40], [300, 110], [120, 200], [250, 230], [370, 220], [200, 320], [330, 350], [80, 330]];
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [2, 5], [4, 6], [5, 7], [6, 7], [3, 8], [8, 6], [1, 4]];
  return (
    <svg className="mesh" viewBox="0 0 420 420" aria-hidden="true">
      {edges.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="var(--rule)" strokeWidth="1.5" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 4 ? 11 : 7} fill={i === 4 ? 'var(--amber)' : i % 3 === 0 ? 'var(--moss)' : 'var(--paper)'} stroke="var(--moss)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function Intro() {
  return (
    <section className="auth-intro">
      <div className="wordmark" style={{ padding: 0 }}><Logo /> ResearchMesh</div>
      <div>
        <h1>Find who is doing the research you care about, this year.</h1>
        <p>
          Search faculty by what they have published recently and whether their lab has room. Faculty can
          find students across departments with the exact skills a project needs.
        </p>
      </div>
      <MeshArt />
    </section>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [run, { loading, error }] = useMutation(LOGIN);

  const submit = async (email, password) => {
    const { data } = await run({ variables: { email, password } }).catch(() => ({}));
    if (data?.login) {
      login(data.login.token);
      navigate('/');
    }
  };

  return (
    <div className="auth">
      <Intro />
      <section className="auth-form">
        <h2>Log in</h2>
        <form className="stack" style={{ marginTop: 18 }} onSubmit={(e) => { e.preventDefault(); submit(form.email, form.password); }}>
          <label className="field">Email
            <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">Password
            <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>New here? <Link to="/register">Create an account</Link></p>
        <div className="demo-logins">
          <div className="muted">Try a seeded demo account:</div>
          {['student', 'faculty', 'admin'].map((r) => (
            <button key={r} type="button" className="btn btn-sm" onClick={() => submit(`${r}@researchmesh.dev`, 'password123')}>
              Log in as {r}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { data: deptData } = useQuery(DEPARTMENTS);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STUDENT', departmentId: '', program: '', title: '' });
  const [run, { loading, error }] = useMutation(REGISTER);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const input = { ...form, departmentId: form.departmentId || null };
    if (form.role === 'STUDENT') delete input.title;
    else delete input.program;
    const { data } = await run({ variables: { input } }).catch(() => ({}));
    if (data?.register) {
      login(data.register.token);
      navigate('/profile/edit');
    }
  };

  return (
    <div className="auth">
      <Intro />
      <section className="auth-form">
        <h2>Create your account</h2>
        <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
          <div className="row" role="radiogroup" aria-label="I am a">
            {['STUDENT', 'FACULTY'].map((r) => (
              <label key={r} className="check">
                <input type="radio" name="role" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                {r === 'STUDENT' ? 'Student' : 'Faculty'}
              </label>
            ))}
          </div>
          <label className="field">Full name<input required value={form.name} onChange={set('name')} /></label>
          <label className="field">University email<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label className="field">Password (8+ characters)<input type="password" minLength={8} required value={form.password} onChange={set('password')} /></label>
          <label className="field">Department
            <select value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Choose…</option>
              {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {form.role === 'STUDENT'
            ? <label className="field">Program<input placeholder="MCA, M.Tech, PhD…" value={form.program} onChange={set('program')} /></label>
            : <label className="field">Title<input placeholder="Assistant Professor" value={form.title} onChange={set('title')} /></label>}
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>Already registered? <Link to="/login">Log in</Link></p>
      </section>
    </div>
  );
}
