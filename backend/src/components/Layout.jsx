import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth.jsx';

const link = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-lg font-bold text-emerald-700">🏆 Champions Club</span>
            <nav className="flex flex-wrap gap-1">
              <NavLink to="/" end className={link}>Dashboard</NavLink>
              <NavLink to="/members" className={link}>Members</NavLink>
              <NavLink to="/bookings" className={link}>Bookings</NavLink>
              <NavLink to="/inventory" className={link}>Inventory</NavLink>
              <NavLink to="/pos" className={link}>Point of sale</NavLink>
              <NavLink to="/orders" className={link}>Orders</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/shop" target="_blank" className="text-emerald-700 hover:underline">Public store ↗</a>
            <span className="text-slate-600">{user.name} · {user.role}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-900">Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4"><Outlet /></main>
    </div>
  );
}
