import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { DEPARTMENT_STATS, CREATE_DEPARTMENT, DEPARTMENTS } from '../../graphql/operations.js';
import { Loading, ErrorNote, useToast } from '../../components/ui.jsx';

export default function AdminDepartments() {
  const toast = useToast();
  const { data, loading, error } = useQuery(DEPARTMENT_STATS, { fetchPolicy: 'cache-and-network' });
  const [form, setForm] = useState({ name: '', code: '' });
  const [create, { loading: saving, error: saveError, reset }] = useMutation(CREATE_DEPARTMENT, { refetchQueries: [DEPARTMENT_STATS, DEPARTMENTS] });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} />;
  const rows = data.departmentStats;
  const total = (k) => rows.reduce((s, r) => s + r[k], 0);

  return (
    <>
      <div className="page-head"><div><h1>Departments</h1><p className="muted">Departments appear in sign-up, search filters and lab set-up.</p></div></div>

      <form className="panel" style={{ marginBottom: 16 }} onSubmit={async (e) => {
        e.preventDefault();
        const r = await create({ variables: form }).catch(() => null);
        if (r) { toast({ kind: 'ok', title: 'Department added', body: `${form.name} is now available everywhere.` }); setForm({ name: '', code: '' }); }
      }}>
        <h3 style={{ marginBottom: 12 }}>Add a department</h3>
        <div className="form-grid">
          <label className="field">Name<input required placeholder="Civil Engineering" value={form.name} onChange={(e) => { reset(); setForm({ ...form, name: e.target.value }); }} /></label>
          <label className="field">Code (2–8 letters)<input required pattern="[A-Za-z]{2,8}" placeholder="CIVIL" value={form.code} onChange={(e) => { reset(); setForm({ ...form, code: e.target.value.toUpperCase() }); }} /></label>
        </div>
        <div style={{ marginTop: 12 }}><ErrorNote error={saveError} /></div>
        <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={saving}>Add department</button>
      </form>

      <section className="panel" style={{ padding: 0 }}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Code</th><th>Department</th><th>Faculty</th><th>Publishing now</th><th>Students</th><th>Labs</th><th>Open lab slots</th><th>Open projects</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.department.id}>
                <td><strong>{d.department.code}</strong></td>
                <td>{d.department.name}</td>
                <td>{d.faculty}</td>
                <td>{d.activeResearchers}</td>
                <td>{d.students}</td>
                <td>{d.labs}</td>
                <td>{d.openSlots}</td>
                <td>{d.openProjects}</td>
              </tr>
            ))}
            <tr className="total">
              <td /><td>All departments</td>
              <td>{total('faculty')}</td><td>{total('activeResearchers')}</td><td>{total('students')}</td><td>{total('labs')}</td><td>{total('openSlots')}</td><td>{total('openProjects')}</td>
            </tr>
          </tbody>
        </table></div>
      </section>
    </>
  );
}
