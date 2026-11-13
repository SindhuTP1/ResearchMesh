import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { Login, Register, HOME_FOR_ROLE } from './pages/Auth.jsx';
// shared
const Projects = lazy(() => import('./pages/Projects.jsx'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail.jsx'));
const Labs = lazy(() => import('./pages/Labs.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const ProfileEdit = lazy(() => import('./pages/Profile.jsx').then((m) => ({ default: m.ProfileEdit })));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Requests = lazy(() => import('./pages/Requests.jsx'));
// student
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard.jsx'));
const Matches = lazy(() => import('./pages/Matches.jsx'));
const FindTeammates = lazy(() => import('./pages/student/FindTeammates.jsx'));
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Connections = lazy(() => import('./pages/Connections.jsx'));
// faculty
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard.jsx'));
const MyLab = lazy(() => import('./pages/MyLab.jsx'));
const Students = lazy(() => import('./pages/Students.jsx'));
const MyProjects = lazy(() => import('./pages/faculty/MyProjects.jsx'));
const Publications = lazy(() => import('./pages/faculty/Publications.jsx'));
// admin
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'));
const AdminVerifications = lazy(() => import('./pages/admin/AdminVerifications.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminDepartments = lazy(() => import('./pages/admin/AdminDepartments.jsx'));
const AdminProjects = lazy(() => import('./pages/admin/AdminProjects.jsx'));

const S = ['STUDENT'];
const F = ['FACULTY'];
const A = ['ADMIN'];
const SF = ['STUDENT', 'FACULTY'];
const ALL = ['STUDENT', 'FACULTY', 'ADMIN'];

/** Logged in AND one of `roles`; anyone else is sent to their own dashboard. */
function RequireAuth({ children, roles = ALL }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (loading || !user) return <main><Loading /></main>;
  if (!roles.includes(user.role)) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
}

const only = (roles, el) => <RequireAuth roles={roles}><Suspense fallback={<Loading />}>{el}</Suspense></RequireAuth>;
const page = (el) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export default function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={token ? <Navigate to="/" replace /> : <Register />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />

        {/* student portal */}
        <Route path="student" element={only(S, <StudentDashboard />)} />
        <Route path="matches" element={only(S, <Matches />)} />
        <Route path="applications" element={only(S, <Requests studentMode />)} />
        <Route path="teammates" element={only(S, <FindTeammates />)} />

        {/* faculty portal */}
        <Route path="faculty" element={only(F, <FacultyDashboard />)} />
        <Route path="my-lab" element={only(F, <MyLab />)} />
        <Route path="students" element={only(F, <Students />)} />
        <Route path="my-projects" element={only(F, <MyProjects />)} />
        <Route path="publications" element={only(F, <Publications />)} />
        <Route path="requests" element={only(F, <Requests />)} />

        {/* student + faculty */}
        <Route path="discover" element={only(SF, <Discover />)} />
        <Route path="projects" element={only(SF, <Projects />)} />
        <Route path="labs" element={only(SF, <Labs />)} />
        <Route path="profile/edit" element={only(SF, <ProfileEdit />)} />
        <Route path="connections" element={only(SF, <Connections />)} />
        <Route path="messages" element={only(SF, <Messages />)} />
        <Route path="messages/:id" element={only(SF, <Messages />)} />

        {/* admin portal */}
        <Route path="admin" element={only(A, <AdminOverview />)} />
        <Route path="admin/verifications" element={only(A, <AdminVerifications />)} />
        <Route path="admin/users" element={only(A, <AdminUsers />)} />
        <Route path="admin/departments" element={only(A, <AdminDepartments />)} />
        <Route path="admin/projects" element={only(A, <AdminProjects />)} />

        {/* everyone */}
        <Route path="projects/:id" element={page(<ProjectDetail />)} />
        <Route path="people/:id" element={page(<Profile />)} />
        <Route path="notifications" element={page(<Notifications />)} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
