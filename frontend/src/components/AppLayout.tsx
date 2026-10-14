import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/links" className="brand"><span className="brand-mark">s</span><span>shortlink<span className="brand-dot">.</span></span></NavLink>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <NavLink to="/links" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span aria-hidden="true">▤</span> All links</NavLink>
        <NavLink to="/links/new" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span aria-hidden="true">＋</span> Create link</NavLink>
      </nav>
      <div className="sidebar-bottom">
        <div className="account-badge"><span className="avatar">{user?.email.slice(0, 1).toUpperCase()}</span><span className="account-email" title={user?.email}>{user?.email}</span></div>
        <button className="nav-link signout" onClick={logout}><span aria-hidden="true">↪</span> Sign out</button>
      </div>
    </aside>
    <div className="main-column">
      <header className="mobile-header"><NavLink to="/links" className="brand"><span className="brand-mark">s</span> shortlink<span className="brand-dot">.</span></NavLink><div className="mobile-actions"><button className="button button-quiet button-small" onClick={() => navigate('/links/new')}>＋ Create</button><button className="button button-quiet button-small" onClick={logout}>Sign out</button></div></header>
      <main className="page-content"><Outlet /></main>
      <footer className="site-footer"><span>Shortlink workspace</span><span>Simple links. Clear insights.</span></footer>
    </div>
  </div>;
}
