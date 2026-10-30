import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { NOTIFICATIONS, MARK_READ } from '../graphql/operations.js';
import { Loading, ErrorNote, Empty, timeAgo } from '../components/ui.jsx';

function linkFor(n) {
  if (n.type === 'JOIN_REQUEST') return '/requests';
  if (n.project) return `/projects/${n.project.id}`;
  if (n.lab) return '/labs';
  if (n.actor) return `/people/${n.actor.id}`;
  return null;
}

export default function Notifications() {
  // List is kept current by the NotificationAdded subscription in Layout (written straight into cache).
  const { data, loading, error } = useQuery(NOTIFICATIONS);
  const [markRead] = useMutation(MARK_READ, {
    update(cache, _res, { variables }) {
      const ids = variables?.ids;
      for (const n of data?.notifications ?? []) {
        if (!n.read && (!ids || ids.includes(n.id))) {
          cache.modify({ id: cache.identify(n), fields: { read: () => true } });
        }
      }
      cache.modify({ fields: { unreadNotificationCount: (c) => (ids ? Math.max(0, c - ids.length) : 0) } });
    },
  });
  const list = data?.notifications ?? [];
  const unread = data?.unreadNotificationCount ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Join requests, decisions, and new openings that match your interests. New ones arrive here without a refresh.</p>
        </div>
        {unread > 0 && <button className="btn btn-sm" onClick={() => markRead({ variables: { ids: null } })}>Mark all as read</button>}
      </div>
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && <Empty><p>Nothing yet. Request to join a project, or add interests to your profile to hear about matching openings.</p></Empty>}
      <div className="notes">
        {list.map((n) => {
          const to = linkFor(n);
          return (
            <div key={n.id} className={`note ${n.read ? '' : 'unread'}`}>
              <span className="dot" aria-label={n.read ? undefined : 'Unread'} />
              <div>
                <div className="msg">{to ? <Link to={to} onClick={() => !n.read && markRead({ variables: { ids: [n.id] } })}>{n.message}</Link> : n.message}</div>
                <div className="faint">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.read && <button className="btn btn-ghost btn-sm" onClick={() => markRead({ variables: { ids: [n.id] } })}>Mark read</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}
