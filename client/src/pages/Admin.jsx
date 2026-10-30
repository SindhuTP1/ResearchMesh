import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { ADMIN_OVERVIEW, SET_ROLE, DELETE_USER } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, ErrorNote, UserLink, useToast, errorText } from '../components/ui.jsx';

export default function Admin() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useQuery(ADMIN_OVERVIEW);
  const [setRole] = useMutation(SET_ROLE);
  const [del] = useMutation(DELETE_USER, { refetchQueries: [ADMIN_OVERVIEW] });

  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const s = data.adminStats;
  const users = data.allUsers.filter((u) => !filter || `${u.name} ${u.email}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="page-head"><div><h1>Admin</h1><p className="muted">Platform health and user roles.</p></div></div>
      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat"><b>{s.users}</b><span>users</span></div>
        <div className="stat"><b>{s.students}</b><span>students</span></div>
        <div className="stat"><b>{s.faculty}</b><span>faculty</span></div>
        <div className="stat"><b>{s.labs}</b><span>labs</span></div>
        <div className="stat"><b>{s.openProjects}</b><span>open projects</span></div>
        <div className="stat"><b>{s.unattachedStudents}</b><span>students without a lab</span></div>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h3>Users</h3>
          <input style={{ maxWidth: 240 }} placeholder="Search name or email" aria-label="Search users" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Dept</th><th>Lab</th><th>Role</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td><UserLink user={u} /></td>
              <td className="faint">{u.email}</td>
              <td>{u.department?.code}</td>
              <td>{u.lab?.name ?? <span className="faint">–</span>}</td>
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
