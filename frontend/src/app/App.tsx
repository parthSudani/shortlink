import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Loading } from '../components/Feedback';
import { useAuth } from '../features/auth/AuthContext';
import { AuthPage } from '../pages/AuthPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { CreateLinkPage } from '../pages/CreateLinkPage';
import { LinksPage } from '../pages/LinksPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session…" />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking your session…" />;
  return user ? <Navigate to="/links" replace /> : <Outlet />;
}

function NotFound() {
  return <main className="auth-screen"><section className="auth-card"><div className="brand"><span className="brand-mark">s</span> shortlink</div><p className="eyebrow">404 / PAGE NOT FOUND</p><h1>This page isn’t here.</h1><p className="muted">The address may be incorrect or the page may have moved.</p><Link className="button button-primary" to="/links">Go to your links</Link></section></main>;
}

export function App() {
  return <Routes>
    <Route element={<GuestOnly />}><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /></Route>
    <Route element={<RequireAuth />}><Route element={<AppLayout />}>
      <Route path="/" element={<Navigate to="/links" replace />} />
      <Route path="/links" element={<LinksPage />} />
      <Route path="/links/new" element={<CreateLinkPage />} />
      <Route path="/links/:id/analytics" element={<AnalyticsPage />} />
    </Route></Route>
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
