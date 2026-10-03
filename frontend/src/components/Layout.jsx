import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { ToastContainer } from './ui.jsx';

const navLink = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-emerald-600 text-white shadow-sm'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
  }`;

const subNavLink = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
  }`;

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

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/members',   label: 'Members',   icon: '👥' },
    { to: '/bookings',  label: 'Bookings',  icon: '📅' },
    { to: '/leads',     label: 'Enquiries', icon: '📨', badge: attention > 0 ? attention : null },
    { to: '/inventory', label: 'Inventory', icon: '📦' },
    { to: '/pos',       label: 'Shop POS',  icon: '🛒' },
    { to: '/orders',    label: 'Orders',    icon: '🧾' },
    { to: '/bar',       label: 'Bar',       icon: '🍺' },
    { to: '/kitchen',   label: 'Kitchen',   icon: '👨‍🍳' },
    { to: '/leave',     label: 'Leave',     icon: '🏖️' },
  ];

  const managerItems = [
    { to: '/finance',     label: 'Finance'     },
    { to: '/collections', label: 'Collections' },
    { to: '/invoices',    label: 'Invoices'    },
    { to: '/expenses',    label: 'Bills'       },
    { to: '/payroll',     label: 'Payroll'     },
    { to: '/bar-reports', label: 'Bar reports' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          {/* Logo + mobile toggle */}
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                {mobileOpen
                  ? <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  : <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                }
              </svg>
            </button>
            <span className="flex items-center gap-2 text-lg font-bold text-emerald-700">
              🏆 <span className="hidden sm:inline">Champions Club</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 lg:flex lg:flex-wrap">
            {navItems.map(({ to, label, icon, badge }) => (
              <NavLink key={to} to={to} className={navLink}>
                <span>{icon}</span>
                {label}
                {badge && (
                  <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white leading-none">
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User area */}
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <a href="/" target="_blank" className="hidden text-emerald-700 hover:underline sm:inline">
              Website ↗
            </a>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {user.role}
              </span>
              <span className="max-w-[120px] truncate text-slate-700">{user.name}</span>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Back-office sub-nav */}
        {manager && (
          <div className="border-t border-slate-100 bg-slate-800">
            <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-1.5">
              <span className="mr-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Back office
              </span>
              {managerItems.map(({ to, label }) => (
                <NavLink key={to} to={to} className={subNavLink}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
            <nav className="grid grid-cols-2 gap-1">
              {navItems.map(({ to, label, icon, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={navLink}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{icon}</span>
                  {label}
                  {badge && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
            {manager && (
              <>
                <div className="my-3 border-t border-slate-100" />
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Back office
                </p>
                <nav className="grid grid-cols-3 gap-1">
                  {managerItems.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={subNavLink}
                      onClick={() => setMobileOpen(false)}
                    >
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}
