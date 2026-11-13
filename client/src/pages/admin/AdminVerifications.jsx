import { useMutation, useQuery } from '@apollo/client/react';
import { PENDING_VERIFICATIONS, VERIFY_FACULTY } from '../../graphql/operations.js';
import { Loading, ErrorNote, Empty, UserLink, useToast, errorText, timeAgo } from '../../components/ui.jsx';

/** Faculty who signed up and claim a faculty role; an admin confirms they really are faculty. */
export default function AdminVerifications() {
  const toast = useToast();
  const { data, loading, error } = useQuery(PENDING_VERIFICATIONS, { fetchPolicy: 'cache-and-network' });
  const [verify, { loading: saving }] = useMutation(VERIFY_FACULTY, { refetchQueries: [PENDING_VERIFICATIONS, 'PendingVerificationCount', 'AdminOverview'] });
  const decide = async (u, approve) => {
    try {
      await verify({ variables: { userId: u.id, approve } });
      toast({ kind: 'ok', title: approve ? 'Verified' : 'Declined', body: `${u.name} has been notified.` });
    } catch (e) {
      toast({ kind: 'error', title: 'Not saved', body: errorText(e) });
    }
  };
  const list = data?.pendingVerifications ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Faculty verification</h1>
          <p className="muted">New faculty accounts appear here. Check the email domain and designation against the staff directory before approving. Verified faculty get a badge students can trust.</p>
        </div>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && <Empty><p>All caught up. No one is waiting for verification.</p></Empty>}
      {list.length > 0 && (
        <section className="panel" style={{ padding: 0 }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Designation</th><th>Signed up</th><th /></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id}>
                <td><UserLink user={u} />{u.interests.length > 0 && <div className="faint">{u.interests.slice(0, 3).join(', ')}</div>}</td>
                <td>{u.email}</td>
                <td>{u.department ? <>{u.department.code}<div className="faint">{u.department.name}</div></> : <span className="faint">–</span>}</td>
                <td>{u.title ?? <span className="faint">–</span>}</td>
                <td className="faint">{timeAgo(u.createdAt)}</td>
                <td>
                  <div className="row">
                    <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => decide(u, true)}>Verify</button>
                    <button className="btn btn-sm" disabled={saving} onClick={() => decide(u, false)}>Decline</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
