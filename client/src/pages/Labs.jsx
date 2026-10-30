import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { LABS, REQUEST_TO_JOIN } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, ErrorNote, Empty, UserLink, useToast, errorText } from '../components/ui.jsx';

export default function Labs() {
  const { user } = useAuth();
  const toast = useToast();
  const [area, setArea] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [sent, setSent] = useState({});
  const { data, loading, error } = useQuery(LABS, { variables: { area: area.trim() || null, hasOpenSlots: openOnly || null } });
  const [join] = useMutation(REQUEST_TO_JOIN);
  const canRequest = user?.role === 'STUDENT' && !user?.lab;

  const request = async (lab) => {
    try {
      await join({ variables: { targetType: 'LAB', targetId: lab.id } });
      setSent((s) => ({ ...s, [lab.id]: true }));
      toast({ kind: 'ok', title: 'Request sent', body: `${lab.head.name} will see it right away.` });
    } catch (e) {
      toast({ kind: 'error', title: 'Request not sent', body: errorText(e) });
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Labs</h1>
          <p className="muted">Every research group, with how many places they have open right now.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input style={{ maxWidth: 260 }} placeholder="Research area" aria-label="Research area" value={area} onChange={(e) => setArea(e.target.value)} />
        <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />Only labs with open slots</label>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data?.labs.length === 0 && <Empty><p>No labs match that area.</p></Empty>}
      <div className="table-wrap">
        {data?.labs.length > 0 && (
          <table className="table">
            <thead><tr><th>Lab</th><th>Head</th><th>Areas</th><th>Members</th><th>Open slots</th>{canRequest && <th />}</tr></thead>
            <tbody>
              {data.labs.map((l) => (
                <tr key={l.id}>
                  <td><span className="serif" style={{ fontWeight: 600 }}>{l.name}</span><div className="faint">{l.department.code}</div></td>
                  <td><UserLink user={l.head} /></td>
                  <td><div className="chips" style={{ marginTop: 0 }}>{l.researchAreas.map((a) => <span key={a} className="chip interest">{a}</span>)}</div></td>
                  <td>{l.memberCount}</td>
                  <td>{l.openSlots > 0 ? <strong style={{ color: 'var(--moss-ink)' }}>{l.openSlots}</strong> : <span className="faint">Full</span>}</td>
                  {canRequest && (
                    <td>
                      {l.openSlots > 0 && (sent[l.id]
                        ? <span className="status pending">Requested</span>
                        : <button className="btn btn-sm" onClick={() => request(l)}>Request to join</button>)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
