import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { ToastContainer } from './ui.jsx';

const NAV_ICONS = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1.5" opacity=".7"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" opacity=".7"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" opacity=".7"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" opacity=".7"/>
    </svg>
  ),
  bookings: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="2.5" width="13" height="12" rx="2"/>
      <path d="M1.5 6.5h13M5 1.5v2M11 1.5v2"/>
    </svg>
  ),
  members: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="6" cy="5" r="3" opacity=".8"/>
      <path d="M0 13.5c0-2.485 2.686-4.5 6-4.5s6 2.015 6 4.5" opacity=".7"/>
      <circle cx="13" cy="5" r="2.2" opacity=".5"/>
      <path d="M10.5 13c.45-1.8 2.15-3 3.5-3" opacity=".4"/>
    </svg>
  ),
  shop: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 1h2l2 7h7l2-5H5"/>
      <circle cx="6.5" cy="13" r="1.2" fill="currentColor"/>
      <circle cx="12.5" cy="13" r="1.2" fill="currentColor"/>
    </svg>
  ),
  bar: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 2h10l-1 6H4L3 2z"/>
      <path d="M5 8v5M11 8v5M3.5 13h9"/>
    </svg>
  ),
  finance: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M8 4v1.5M8 10.5V12M6 6.5c0-1 .9-1.5 2-1.5s2 .67 2 1.5-2 1.5-2 2 2 1.5 2 1.5"/>
    </svg>
  ),
  leads: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="3" width="13" height="10" rx="1.5"/>
      <path d="M1.5 6l6.5 4 6.5-4"/>
    </svg>
  ),
  default: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="3" opacity=".8"/>
    </svg>
  ),
};

const ICON_MAP = {
  '/dashboard': 'dashboard', '/bookings': 'bookings', '/members': 'members',
  '/inventory': 'shop', '/pos': 'shop', '/orders': 'shop',
  '/bar': 'bar', '/kitchen': 'bar', '/bar-reports': 'bar',
  '/finance': 'finance', '/collections': 'finance', '/invoices': 'finance',
  '/expenses': 'finance', '/payroll': 'finance',
  '/leads': 'leads', '/leave': 'members', '/staff': 'members',
};

function NavIcon({ to }) {
  const key = ICON_MAP[to] || 'default';
  return <span className="nav-icon">{NAV_ICONS[key]}</span>;
}

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
    { to: '/dashboard', label: 'Dashboard'  },
    { to: '/bookings',  label: 'Bookings'   },
    { to: '/members',   label: 'Members'    },
    { to: '/inventory', label: 'Shop & Inventory' },
    { to: '/pos',       label: 'Shop POS'   },
    { to: '/orders',    label: 'Orders'     },
    { to: '/bar',       label: 'Bar'        },
    { to: '/kitchen',   label: 'Kitchen'    },
    { to: '/leave',     label: 'Leave'      },
  ];

  const businessNav = [
    { to: '/leads', label: 'Enquiries', badge: attention > 0 ? attention : null },
    ...(manager ? [
      { to: '/finance',     label: 'Finance'     },
      { to: '/collections', label: 'Collections' },
      { to: '/invoices',    label: 'Invoices'    },
      { to: '/expenses',    label: 'Bills'       },
      { to: '/payroll',     label: 'Payroll'     },
      { to: '/bar-reports', label: 'Bar Reports' },
      { to: '/staff',       label: 'Staff & Users' },
    ] : []),
  ];

  const initials = user.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CC';

  return (
    <div className={`app-shell${mobileOpen ? ' nav-open' : ''}`}>
      {/* ── Sidebar ── */}
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
          {workspaceNav.map(({ to, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <NavIcon to={to} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-section">BUSINESS</div>
        <nav className="nav-list">
          {businessNav.map(({ to, label, badge }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <NavIcon to={to} />
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-tools">
          <a href="/" target="_blank" rel="noreferrer" className="sidebar-tool">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 2H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8M9 1h4m0 0v4m0-4L6 8"/>
            </svg>
            Public website
          </a>
          <button className="sidebar-tool danger" onClick={logout}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M9 1H12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9M5 10l4-3-4-3M9 7H1"/>
            </svg>
            Sign out
          </button>
        </div>

        <div className="sidebar-foot">
          <span><span className="status-dot" />System online</span>
          <small>v2.0</small>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-toggle"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {mobileOpen
                  ? <><path d="M1 1l16 12M17 1L1 13"/></>
                  : <><path d="M0 1h18M0 7h18M0 13h18"/></>
                }
              </svg>
            </button>
            <div>
              <div className="breadcrumb">CHAMPIONS CLUB / MANAGEMENT</div>
              <h1>Club Dashboard</h1>
            </div>
          </div>
          <div className="topbar-right">
            <Link to="/bookings" className="new-booking-btn">
              <span className="nb-icon">＋</span>
              New booking
            </Link>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 35, backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
