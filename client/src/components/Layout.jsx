import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useSubscription } from '@apollo/client/react';
import { CallProvider } from './CallProvider.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './ui.jsx';
import { NOTIFICATIONS, UNREAD_COUNT, NOTIFICATION_ADDED, NOTIFICATION_FIELDS, JOIN_REQUEST_CHANGED, PENDING_VERIFICATION_COUNT,
  MESSAGE_ADDED, CONVERSATION_CHANGED, UNREAD_MESSAGE_COUNT, CONNECTIONS_PAGE, PRESENCE_CHANGED } from '../graphql/operations.js';
import { notifyIfHidden, registerServiceWorker } from '../push.js';
import { ThemeToggle } from './theme.jsx';
import CommandPalette from './CommandPalette.jsx';
import { confetti } from './ui.jsx';

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
  const { user } = useAuth();
  const location = useLocation();
  const chatting = (id) => location.pathname === `/messages/${id}` && document.visibilityState === 'visible';
  const social = user.role !== 'ADMIN';
  const navigate = useNavigate();

  // Clicking a system notification focuses this tab and asks it to navigate.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    if ('Notification' in window && Notification.permission === 'granted') registerServiceWorker();
    const onMsg = (e) => {
      if (e.data?.type === 'navigate') {
        const u = new URL(e.data.url, window.location.origin);
        navigate(u.pathname + u.search);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [navigate]);

  // Online / offline dots everywhere: patch the cached User, every view showing them re-renders.
  useSubscription(PRESENCE_CHANGED, {
    skip: !social,
    onData: ({ client, data }) => {
      const p = data.data?.presenceChanged;
      if (!p) return;
      client.cache.modify({ id: client.cache.identify({ __typename: 'User', id: p.userId }), fields: { isOnline: () => p.online } });
    },
  });

  useSubscription(MESSAGE_ADDED, {
    skip: !social,
    onData: ({ client, data }) => {
      const m = data.data?.messageAdded;
      if (!m) return;
      client.refetchQueries({ include: ['Conversations', UNREAD_MESSAGE_COUNT] });
      if (m.kind === 'TEXT' && m.sender?.id !== user.id && !chatting(m.conversationId)) {
        const text = m.body || (m.attachment ? `📎 ${m.attachment.name}` : '');
        const short = text.length > 120 ? `${text.slice(0, 120)}…` : text;
        toast({ title: m.sender?.name ?? 'New message', body: short, ms: 4000 });
        notifyIfHidden(m.sender?.name ?? 'New message', short, `/messages/${m.conversationId}`);
      }
    },
  });

  useSubscription(CONVERSATION_CHANGED, {
    skip: !social,
    onData: ({ client }) => client.refetchQueries({ include: ['Conversations', 'Conversation'] }),
  });

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
      const titles = { JOIN_REQUEST: 'New join request', MATCHING_OPENING: 'New opening that fits you', ACCOUNT_UPDATE: 'Account update', REQUEST_ACCEPTED: 'Accepted', REQUEST_REJECTED: 'Declined', CONNECTION_REQUEST: 'Connection request', NEW_CONNECTION: 'New connection', PROJECT_INVITE: 'Team invite' };
      toast({ title: titles[n.type] ?? 'Update', body: n.message });
      notifyIfHidden(titles[n.type] ?? 'ResearchMesh', n.message, '/notifications');
      if (n.type === 'REQUEST_ACCEPTED' || n.type === 'NEW_CONNECTION') confetti();
      if (n.type === 'ACCOUNT_UPDATE') client.refetchQueries({ include: ['Me', 'PendingVerificationCount'] });
      if (['CONNECTION_REQUEST', 'NEW_CONNECTION', 'REQUEST_ACCEPTED'].includes(n.type)) client.refetchQueries({ include: [CONNECTIONS_PAGE, 'UserProfile', 'FindTeammates'] });
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

/**
 * Each role gets its own portal: different home, different tools. Shared pages (profiles, project
 * detail, notifications) are reachable from links inside each portal.
 */
const NAV = {
  STUDENT: [
    ['Overview', [['/student', 'Dashboard', true]]],
    ['Find', [['/search', 'Search'], ['/discover', 'Find faculty'], ['/matches', 'My matches'], ['/teammates', 'Find teammates'], ['/projects', 'Projects'], ['/labs', 'Labs']]],
    ['Talk', [['/messages', 'Messages'], ['/connections', 'Connections']]],
    ['You', [['/applications', 'Applications & invites'], ['/notifications', 'Notifications'], ['/profile', 'Profile']]],
  ],
  FACULTY: [
    ['Overview', [['/faculty', 'Dashboard', true]]],
    ['Your research', [['/my-lab', 'My lab'], ['/my-projects', 'My projects'], ['/publications', 'Publications'], ['/requests', 'Join requests']]],
    ['Find', [['/search', 'Search'], ['/students', 'Find students'], ['/discover', 'Faculty directory'], ['/projects', 'All projects']]],
    ['Talk', [['/messages', 'Messages'], ['/connections', 'Connections']]],
    ['You', [['/notifications', 'Notifications'], ['/profile', 'Profile']]],
  ],
  ADMIN: [
    ['Platform', [['/admin', 'Overview', true], ['/admin/verifications', 'Verifications'], ['/admin/users', 'Users'], ['/admin/departments', 'Departments'], ['/admin/projects', 'Projects & labs']]],
    ['You', [['/notifications', 'Notifications']]],
  ],
};
const PORTAL = { STUDENT: 'Student portal', FACULTY: 'Faculty portal', ADMIN: 'Admin console' };

function MessageBadge() {
  const { data } = useQuery(UNREAD_MESSAGE_COUNT, { fetchPolicy: 'cache-and-network' });
  const n = data?.unreadMessageCount ?? 0;
  return n > 0 ? <span className="badge-live" aria-label={`${n} unread messages`}>{n}</span> : null;
}

function VerificationBadge() {
  const { data } = useQuery(PENDING_VERIFICATION_COUNT, { fetchPolicy: 'cache-and-network' });
  const n = data?.adminStats?.pendingVerifications ?? 0;
  return n > 0 ? <span className="badge-live" aria-label={`${n} waiting`}>{n}</span> : null;
}

const DASHBOARD = { STUDENT: '/student', FACULTY: '/faculty', ADMIN: '/admin' };

/**
 * "← Back" above every page except the dashboard. Goes to the previous page inside the app, or to
 * the dashboard when there's nothing to go back to (the first page opened in this tab).
 */
function BackBar({ role }) {
  const navigate = useNavigate();
  const location = useLocation();
  const home = DASHBOARD[role];
  if (location.pathname === home || location.pathname.startsWith('/messages/')) return null;
  const back = () => (location.key === 'default' ? navigate(home) : navigate(-1));
  return (
    <div className="back-bar">
      <button type="button" className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
      <Link to={home} className="faint">Dashboard</Link>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => setNavOpen(false), [location.pathname]);
  // Re-key the page wrapper per section so each page slides in; chats switching inside /messages don't re-animate.
  const section = location.pathname.split('/').slice(0, location.pathname.startsWith('/admin') ? 3 : 2).join('/');
  const { data } = useQuery(UNREAD_COUNT, { fetchPolicy: 'cache-and-network' });
  useQuery(NOTIFICATIONS, { fetchPolicy: 'cache-first' }); // warm the list so live inserts have somewhere to go
  const unread = data?.unreadNotificationCount ?? 0;
  const groups = NAV[user.role] ?? [];

  const shell = (
    <div className={`shell portal-${user.role.toLowerCase()} ${navOpen ? 'nav-open' : ''}`}>
      <LiveUpdates />
      <aside className="sidebar">
        <div>
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <Link to="/" className="wordmark"><Logo /> ResearchMesh</Link>
            <button className="icon-btn nav-toggle" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>{navOpen ? '✕' : '☰'}</button>
          </div>
          <div className="portal-tag">{PORTAL[user.role]}</div>
          <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Quick search (Ctrl+K)">
            <span>🔎 Search…</span><kbd>Ctrl K</kbd>
          </button>
        </div>
        <nav className="nav" aria-label="Main">
          {groups.map(([group, links]) => (
            <div key={group} className="nav-section">
              <div className="nav-group">{group}</div>
              {links.map(([to, label, end]) => (
                <NavLink key={to} to={to === '/profile' ? `/people/${user.id}` : to} end={end}>
                  {label}
                  {to === '/notifications' && unread > 0 && <span className="badge-live" aria-label={`${unread} unread`}>{unread}</span>}
                  {to === '/admin/verifications' && <VerificationBadge />}
                  {to === '/messages' && <MessageBadge />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who-row">
            <div>
              <div className="who">{user.name}</div>
              <div className="faint">{user.title || user.program || user.role.toLowerCase()}{user.department ? `, ${user.department.code}` : ''}</div>
            </div>
            <ThemeToggle />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ marginTop: 6, paddingLeft: 0 }}>Log out</button>
        </div>
      </aside>
      <CommandPalette nav={groups} open={palette} onClose={() => setPalette(false)} />
      <main>
        <BackBar role={user.role} />
        <div key={section} className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
  // Video calls are for students and faculty; admins don't take part in chats.
  return user.role === 'ADMIN' ? shell : <CallProvider>{shell}</CallProvider>;
}
