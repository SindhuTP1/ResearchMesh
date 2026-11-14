import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { FIND_PEOPLE } from '../graphql/operations.js';
import { PersonActions } from './social.jsx';
import { Avatar, ErrorNote } from './ui.jsx';

const ROLE_FILTERS = [['', 'Everyone'], ['STUDENT', 'Students'], ['FACULTY', 'Faculty']];

/**
 * Dashboard search: find students and faculty by name, with Connect / Message right in the results.
 * Results appear as you type (2+ letters). "Search everything" hands the text to the full search page.
 */
export default function PeopleSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [role, setRole] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const searching = term.length >= 2;
  const { data, previousData, loading, error } = useQuery(FIND_PEOPLE, {
    variables: { name: term, role: role || null, limit: 8 },
    skip: !searching,
    fetchPolicy: 'cache-and-network',
  });
  const people = searching ? (data ?? previousData)?.findPeople ?? [] : [];

  return (
    <section className="people-search" aria-label="Find people by name">
      <form className="search-box" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <span aria-hidden="true">🔎</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find people by name"
          placeholder="Find students and faculty by name…" />
        <select aria-label="Who" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </form>

      {searching && (
        <div className="people-search-results">
          <ErrorNote error={error} />
          {!loading && people.length === 0 && <p className="faint">No one named “{term}”.</p>}
          {people.map((u) => (
            <div key={u.id} className="people-search-row">
              <Avatar user={u} />
              <div className="who-col">
                <Link className="name" to={`/people/${u.id}`}>{u.name}</Link>
                <span className={`role-tag ${u.role.toLowerCase()}`}>{u.role === 'FACULTY' ? 'Faculty' : 'Student'}</span>
                <div className="faint">
                  {[u.role === 'FACULTY' ? u.title : u.program && `${u.program}${u.yearOfStudy ? `, year ${u.yearOfStudy}` : ''}`, u.department?.code, u.lab?.name].filter(Boolean).join(' · ')}
                </div>
              </div>
              <PersonActions user={u} />
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}>
            Search projects, labs and papers for “{term}” →
          </button>
        </div>
      )}
    </section>
  );
}
