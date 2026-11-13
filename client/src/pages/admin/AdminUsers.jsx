import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { ADMIN_USERS, SET_ROLE, DELETE_USER } from '../../graphql/operations.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Loading, ErrorNote, UserLink, useToast, errorText, timeAgo } from '../../components/ui.jsx';

const ROLE_TABS = [['', 'Everyone'], ['STUDENT', 'Students'], ['FACULTY', 'Faculty'], ['ADMIN', 'Admins']];

export default function AdminUsers() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') ?? '';
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const { data, loading, error } = useQuery(ADMIN_USERS, { fetchPolicy: 'cache-and-network' });
  const [setRole] = useMutation(SET_ROLE);
  const [del] = useMutation(DELETE_USER, { refetchQueries: [ADMIN_USERS] });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} />;
  const needle = q.trim().toLowerCase();
  const users = data.allUsers.filter((u) =>
    (!role || u.role === role) && (!dept || u.department?.id === dept) && (!needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)));
  const count = (r) => data.allUsers.filter((u) => !r || u.role === r).length;

  return (
    <>
      <div className="page-head"><div><h1>Users</h1><p className="muted">Everyone with an account or directory profile. Change roles or remove accounts.</p></div></div>
      <div className="row" role="tablist" style={{ marginBottom: 12 }}>
        {ROLE_TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={role === v} className={`btn btn-sm ${role === v ? 'btn-primary' : ''}`} onClick={() => setParams(v ? { role: v } : {}, { replace: true })}>
            {l} <span style={{ opacity: 0.7 }}>{count(v)}</span>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <input style={{ maxWidth: 260 }} placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Department" style={{ width: 'auto' }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {data.departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
          <span className="faint">{users.length} shown</span>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Dept</th><th>Lab</th><th>Joined</th><th>Role</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>
                <UserLink user={u} />
                <div className="faint">{u.title || u.program || ''}{u.role === 'FACULTY' && u.verification !== 'VERIFIED' && <span className="unverified" style={{ marginLeft: 6 }}>{u.verification.toLowerCase()}</span>}</div>
              </td>
              <td className="faint">{u.email}</td>
              <td>{u.department?.code ?? <span className="faint">–</span>}</td>
              <td>{u.lab?.name ?? <span className="faint">–</span>}</td>
              <td className="faint">{timeAgo(u.createdAt)}</td>
              <td>
                <select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me.id} style={{ width: 'auto' }}
                  onChange={(e) => setRole({ variables: { userId: u.id, role: e.target.value } }).catch((err) => toast({ kind: 'error', title: 'Not changed', body: errorText(err) }))}>
                  {['STUDENT', 'FACULTY', 'ADMIN'].map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                </select>
              </td>
              <td>{u.id !== me.id && (
                <button className="btn btn-ghost btn-sm btn-danger" onClick={() => {
                  if (window.confirm(`Delete ${u.name}? This removes their requests and notifications too.`)) del({ variables: { userId: u.id } });
                }}>Delete</button>
              )}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
