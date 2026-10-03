import { Link, NavLink, Outlet } from 'react-router';

const link = ({ isActive }) =>
  `text-sm font-medium ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`;

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-emerald-700">🏆 Champions Club</Link>
          <nav className="flex flex-wrap items-center gap-5">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/book" className={link}>Book a trial</NavLink>
            <NavLink to="/shop" className={link}>Pro shop</NavLink>
            <Link to="/#contact" className="text-sm font-medium text-slate-600 hover:text-slate-900">Contact</Link>
            <Link to="/login" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100">Staff login</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t bg-white py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Champions Club · Tennis · Padel · Badminton · Cricket
      </footer>
    </div>
  );
}
