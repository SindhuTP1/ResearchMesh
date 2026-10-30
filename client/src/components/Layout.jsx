import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery, useSubscription } from '@apollo/client/react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './ui.jsx';
import { NOTIFICATIONS, UNREAD_COUNT, NOTIFICATION_ADDED, NOTIFICATION_FIELDS, JOIN_REQUEST_CHANGED } from '../graphql/operations.js';

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 8L24 10L14 24Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="8" r="4" fill="var(--moss)" />
      <circle cx="24" cy="10" r="4" fill="var(--moss)" />
      <circle cx="14" cy="24" r="4" fill="var(--amber)" />
    </svg>
  );
}

/**
 * Live updates: one subscription for notifications, one for join-request changes.
 * Incoming data is written straight into the Apollo cache, so the bell count, the
 * notifications page and the requests page all update without refetching.
 */
function LiveUpdates() {
  const toast = useToast();

  useSubscription(NOTIFICATION_ADDED, {
    onData: ({ client, data }) => {
      const n = data.data?.notificationAdded;
      if (!n) return;
      client.cache.modify({
        fields: {
          unreadNotificationCount: (count = 0) => count + 1,
          notifications: (existing = [], { readField, toReference }) => {
            const ref = client.cache.writeFragment({ data: n, fragment: NOTIFICATION_FIELDS, fragmentName: 'NotificationFields' });
            return existing.some((r) => readField('id', r) === n.id) ? existing : [ref ?? toReference(n), ...existing];
          },
        },
      });
      toast({ title: n.type === 'JOIN_REQUEST' ? 'New join request' : n.type === 'MATCHING_OPENING' ? 'New opening that fits you' : 'Update', body: n.message });
    },
  });

  useSubscription(JOIN_REQUEST_CHANGED, {
    // Existing requests update in place via the normalized cache (same id). For brand-new ones, evict the
    // cached lists so any page currently showing them refetches; pages not mounted just refetch on next visit.
    onData: ({ client }) => {
      client.cache.evict({ id: 'ROOT_QUERY', fieldName: 'myJoinRequests' });
      client.cache.evict({ id: 'ROOT_QUERY', fieldName: 'lab' });
      client.cache.gc();
    },
  });

  return null;
}

export default function Layout() {
  const { user, logout, isFaculty, isAdmin } = useAuth();
  const { data } = useQuery(UNREAD_COUNT, { fetchPolicy: 'cache-and-network' });
  useQuery(NOTIFICATIONS, { fetchPolicy: 'cache-first' }); // warm the list so live inserts have somewhere to go
  const unread = data?.unreadNotificationCount ?? 0;

  return (
    <div className="shell">
      <LiveUpdates />
      <aside className="sidebar">
        <Link to="/" className="wordmark"><Logo /> ResearchMesh</Link>
        <nav className="nav" aria-label="Main">
          <div className="nav-group">Find people</div>
          <NavLink to="/" end>Find faculty</NavLink>
          <NavLink to="/matches">My matches</NavLink>
          {isFaculty && <NavLink to="/students">Find students</NavLink>}
          <div className="nav-group">Work</div>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/labs">Labs</NavLink>
          {isFaculty && <NavLink to="/my-lab">My lab</NavLink>}
          <NavLink to="/requests">Requests</NavLink>
          <NavLink to="/notifications">
            Notifications {unread > 0 && <span className="badge-live" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
          <div className="nav-group">You</div>
          <NavLink to={`/people/${user?.id}`}>Profile</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{user?.name}</div>
          <div className="faint">{user?.role?.toLowerCase()}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ marginTop: 6, paddingLeft: 0 }}>Log out</button>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
