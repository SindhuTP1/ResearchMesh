import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { MY_REQUESTS, WITHDRAW_REQUEST } from '../graphql/operations.js';
import { Loading, ErrorNote, Empty, Status, UserLink, Skills, timeAgo } from '../components/ui.jsx';
import { RequestActions } from './MyLab.jsx';

const isInvite = (r) => r.kind === 'INVITE';

function Target({ r }) {
  return r.project ? <>project <Link to={`/projects/${r.project.id}`}>{r.project.title}</Link></> : <>lab <strong>{r.lab?.name}</strong></>;
}

/**
 * Faculty: requests received (and invites they sent). Students: applications they sent and team invites
 * they received. Same data, two directions; INVITE requests flip who decides.
 */
export default function Requests({ studentMode = false }) {
  const [params] = useSearchParams();
  const [direction, setDirection] = useState(studentMode && params.get('tab') !== 'invites' ? 'OUTGOING' : 'INCOMING');
  const { data, loading, error, refetch } = useQuery(MY_REQUESTS, { variables: { direction }, fetchPolicy: 'cache-and-network' });
  const [withdraw] = useMutation(WITHDRAW_REQUEST);
  const list = data?.myJoinRequests ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{studentMode ? 'Applications & invites' : 'Join requests'}</h1>
          <p className="muted">{studentMode ? 'Labs and projects you asked to join, and teams that invited you. Accepting connects you with the owner straight away.' : "Join requests you've received, and invites you've sent. Accepting connects you with the student straight away."}</p>
        </div>
        <div className="row" role="tablist">
          {['INCOMING', 'OUTGOING'].map((d) => (
            <button key={d} role="tab" aria-selected={direction === d} className={`btn btn-sm ${direction === d ? 'btn-primary' : ''}`} onClick={() => setDirection(d)}>
              {studentMode ? (d === 'INCOMING' ? 'Invites to me' : 'My applications') : d === 'INCOMING' ? 'Received' : 'Sent'}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && (
        <Empty>{direction === 'INCOMING'
          ? <p>{studentMode ? <>No invites yet. Connect with people on <Link to="/teammates">Find teammates</Link>.</> : 'No one has asked to join your projects or lab yet.'}</p>
          : <p>Nothing sent yet. <Link to="/projects">Browse projects</Link>{studentMode && <> or <Link to="/labs">labs</Link></>}.</p>}</Empty>
      )}
      <div>
        {list.map((r) => (
          <div className="request" key={r.id}>
            <div>
              {direction === 'INCOMING'
                ? isInvite(r)
                  ? <><UserLink user={r.requester} /> invited you to join the <Target r={r} /></>
                  : <><UserLink user={r.requester} /> wants to join your <Target r={r} /></>
                : isInvite(r)
                  ? <>You invited <UserLink user={r.recipient} /> to the <Target r={r} /></>
                  : <>You asked to join the <Target r={r} /> <span className="faint">({r.recipient.name})</span></>}
              <div className="faint">{timeAgo(r.createdAt)}</div>
              {direction === 'INCOMING' && !isInvite(r) && <Skills skills={r.requester.skills} max={6} />}
              {r.message && <blockquote>{r.message}</blockquote>}
            </div>
            <div>
              {direction === 'INCOMING' && r.status === 'PENDING' ? <RequestActions request={r} refetch={refetch} />
                : direction === 'OUTGOING' && r.status === 'PENDING'
                  ? <div className="row"><Status value="PENDING" /><button className="btn btn-ghost btn-sm" onClick={() => withdraw({ variables: { id: r.id } })}>Withdraw</button></div>
                  : <Status value={r.status} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
