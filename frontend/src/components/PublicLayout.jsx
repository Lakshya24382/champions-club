import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

const link = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'
  }`;

export default function PublicLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-emerald-700">
            🏆 Champions Club
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 md:flex">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/book" className={link}>Book a trial</NavLink>
            <NavLink to="/shop" className={link}>Pro shop</NavLink>
            <Link to="/#contact" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Contact
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 md:inline-block"
            >
              Staff login
            </Link>
            {/* Mobile hamburger */}
            <button
              onClick={() => setOpen(!open)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                {open
                  ? <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  : <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-slate-100 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-2 text-sm font-medium">
              <NavLink to="/" end className={link} onClick={() => setOpen(false)}>Home</NavLink>
              <NavLink to="/book" className={link} onClick={() => setOpen(false)}>Book a trial</NavLink>
              <NavLink to="/shop" className={link} onClick={() => setOpen(false)}>Pro shop</NavLink>
              <Link to="/#contact" className="text-slate-600 hover:text-slate-900" onClick={() => setOpen(false)}>Contact</Link>
              <Link to="/login" className="text-slate-600 hover:text-slate-900" onClick={() => setOpen(false)}>Staff login</Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
          <p className="font-medium text-slate-700">🏆 Champions Club</p>
          <p className="mt-1">Tennis · Padel · Badminton · Cricket</p>
          <p className="mt-2">© {new Date().getFullYear()} Champions Club. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
