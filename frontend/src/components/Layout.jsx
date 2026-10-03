import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { ToastContainer } from './ui.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const manager = ['owner', 'admin'].includes(user.role);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: ls } = useQuery({
    queryKey: ['leads-summary'],
    queryFn: () => api('/leads/summary'),
    refetchInterval: 30_000,
  });
  const attention = ls?.attention_count ?? 0;

  const workspaceNav = [
    { to: '/dashboard', label: 'Dashboard',  icon: '⌂' },
    { to: '/bookings',  label: 'Bookings',   icon: '▦' },
    { to: '/members',   label: 'Members',    icon: '♙' },
    { to: '/inventory', label: 'Shop & Inventory', icon: '□' },
    { to: '/pos',       label: 'Shop POS',   icon: '⊞' },
    { to: '/orders',    label: 'Orders',     icon: '◫' },
    { to: '/bar',       label: 'Bar',        icon: '◈' },
    { to: '/kitchen',   label: 'Kitchen',    icon: '◉' },
    { to: '/leave',     label: 'Leave',      icon: '◷' },
  ];

  const businessNav = [
    { to: '/leads',       label: 'Enquiries',    icon: '✉', badge: attention > 0 ? attention : null },
    ...(manager ? [
      { to: '/finance',     label: 'Finance',    icon: '₹' },
      { to: '/collections', label: 'Collections',icon: '⊟' },
      { to: '/invoices',    label: 'Invoices',   icon: '◧' },
      { to: '/expenses',    label: 'Bills',      icon: '◱' },
      { to: '/payroll',     label: 'Payroll',    icon: '♟' },
      { to: '/bar-reports', label: 'Bar Reports',icon: '▥' },
      { to: '/staff',      label: 'Staff & Users', icon: '⚙' },
    ] : []),
  ];

  const initials = user.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'CC';

  return (
    <div className={`app-shell${mobileOpen ? ' nav-open' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="brand-mark">CC</div>
          <div>
            <span className="brand-name">CHAMPIONS</span>
            <span className="brand-sub">CLUB MANAGEMENT</span>
          </div>
        </Link>

        <div className="sidebar-section">WORKSPACE</div>
        <nav className="nav-list">
          {workspaceNav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-section">BUSINESS</div>
        <nav className="nav-list">
          {businessNav.map(({ to, label, icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-tools">
          <a href="/" target="_blank" rel="noreferrer" className="sidebar-tool">↗ Public website</a>
          <button className="sidebar-tool danger" onClick={logout}>↪ Sign out</button>
        </div>

        <div className="sidebar-foot">
          <span><span className="status-dot" />System online</span>
          <small>v2.0</small>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">☰</button>
            <div>
              <div className="breadcrumb">CHAMPIONS CLUB / MANAGEMENT</div>
              <h1>Club Dashboard</h1>
            </div>
          </div>
          <div className="topbar-right">
            <Link to="/bookings" className="new-booking-btn">＋ New booking</Link>
            <div className="user-chip">
              <div className="avatar">{initials}</div>
              <div className="user-chip-text">
                <b>{user.name}</b>
                <small>{user.role}</small>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 35 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
