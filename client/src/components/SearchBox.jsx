import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A search box for the dashboards and anywhere else: submitting it opens /search with the query.
 */
export default function SearchBox({ placeholder = 'Search people, projects, labs, papers…', autoFocus = false }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
    >
      <span aria-hidden="true">🔎</span>
      <input type="search" value={q} placeholder={placeholder} aria-label="Search ResearchMesh" autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} />
      <button className="btn btn-primary btn-sm" type="submit" disabled={!q.trim()}>Search</button>
    </form>
  );
}
