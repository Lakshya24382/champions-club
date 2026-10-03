import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

const link = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;
const link2 = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const manager = ['owner', 'admin'].includes(user.role);

  const { data: ls } = useQuery({
    queryKey: ['leads-summary'],
    queryFn: () => api('/leads/summary'),
    refetchInterval: 30_000,
  });
  const attention = ls?.attention_count ?? 0;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-lg font-bold text-emerald-700">🏆 Champions Club</span>
            <nav className="flex flex-wrap gap-1">
              <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
              <NavLink to="/members" className={link}>Members</NavLink>
              <NavLink to="/bookings" className={link}>Bookings</NavLink>
              <NavLink to="/leads" className={link}>
                Enquiries
                {attention > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{attention}</span>
                )}
              </NavLink>
              <NavLink to="/inventory" className={link}>Inventory</NavLink>
              <NavLink to="/pos" className={link}>Shop POS</NavLink>
              <NavLink to="/orders" className={link}>Shop orders</NavLink>
              <NavLink to="/bar" className={link}>Bar</NavLink>
              <NavLink to="/kitchen" className={link}>Kitchen</NavLink>
              <NavLink to="/leave" className={link}>Leave</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/" target="_blank" className="text-emerald-700 hover:underline">Website ↗</a>
            <span className="text-slate-600">{user.name} · {user.role}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-900">Log out</button>
          </div>
        </div>
        {manager && (
          <div className="border-t bg-slate-50">
            <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-1.5">
              <span className="mr-2 text-xs font-semibold uppercase text-slate-400">Back office</span>
              <NavLink to="/finance" className={link2}>Finance</NavLink>
              <NavLink to="/collections" className={link2}>Collections</NavLink>
              <NavLink to="/invoices" className={link2}>Invoices</NavLink>
              <NavLink to="/expenses" className={link2}>Bills</NavLink>
              <NavLink to="/payroll" className={link2}>Payroll</NavLink>
              <NavLink to="/bar-reports" className={link2}>Bar reports</NavLink>
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl p-4"><Outlet /></main>
    </div>
  );
}
