import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Discover from './pages/Discover.jsx';
import Matches from './pages/Matches.jsx';
import Students from './pages/Students.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Labs from './pages/Labs.jsx';
import MyLab from './pages/MyLab.jsx';
import Requests from './pages/Requests.jsx';
import Notifications from './pages/Notifications.jsx';
import Profile, { ProfileEdit } from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';

function RequireAuth({ children, role }) {
  const { token, user, loading, isFaculty, isAdmin } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (loading || !user) return <main><Loading /></main>;
  if (role === 'FACULTY' && !isFaculty) return <Navigate to="/" replace />;
  if (role === 'ADMIN' && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={token ? <Navigate to="/" replace /> : <Register />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Discover />} />
        <Route path="matches" element={<Matches />} />
        <Route path="students" element={<RequireAuth role="FACULTY"><Students /></RequireAuth>} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="labs" element={<Labs />} />
        <Route path="my-lab" element={<RequireAuth role="FACULTY"><MyLab /></RequireAuth>} />
        <Route path="requests" element={<Requests />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="people/:id" element={<Profile />} />
        <Route path="profile/edit" element={<ProfileEdit />} />
        <Route path="admin" element={<RequireAuth role="ADMIN"><Admin /></RequireAuth>} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
