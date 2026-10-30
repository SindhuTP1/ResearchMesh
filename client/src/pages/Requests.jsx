import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { MY_REQUESTS, WITHDRAW_REQUEST } from '../graphql/operations.js';
import { Loading, ErrorNote, Empty, Status, UserLink, Skills, timeAgo } from '../components/ui.jsx';
import { RequestActions } from './MyLab.jsx';

function Target({ r }) {
  return r.project ? <>project <Link to={`/projects/${r.project.id}`}>{r.project.title}</Link></> : <>lab <strong>{r.lab?.name}</strong></>;
}

export default function Requests() {
  const [direction, setDirection] = useState('INCOMING');
  const { data, loading, error, refetch } = useQuery(MY_REQUESTS, { variables: { direction }, fetchPolicy: 'cache-and-network' });
  const [withdraw] = useMutation(WITHDRAW_REQUEST);
  const list = data?.myJoinRequests ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Requests</h1>
          <p className="muted">Join requests you've received and sent. Statuses update live.</p>
        </div>
        <div className="row" role="tablist">
          {['INCOMING', 'OUTGOING'].map((d) => (
            <button key={d} role="tab" aria-selected={direction === d} className={`btn btn-sm ${direction === d ? 'btn-primary' : ''}`} onClick={() => setDirection(d)}>
              {d === 'INCOMING' ? 'Received' : 'Sent'}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && (
        <Empty>{direction === 'INCOMING' ? <p>No one has asked to join your projects or lab yet.</p> : <p>You haven't sent any requests. <Link to="/projects">Browse projects</Link>.</p>}</Empty>
      )}
      <div>
        {list.map((r) => (
          <div className="request" key={r.id}>
            <div>
              {direction === 'INCOMING'
                ? <><UserLink user={r.requester} /> wants to join your <Target r={r} /></>
                : <>You asked to join the <Target r={r} /> <span className="faint">({r.recipient.name})</span></>}
              <div className="faint">{timeAgo(r.createdAt)}</div>
              {direction === 'INCOMING' && <Skills skills={r.requester.skills} max={6} />}
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
