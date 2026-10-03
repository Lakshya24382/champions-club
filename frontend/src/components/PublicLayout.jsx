import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/book', label: 'Book a trial' },
  { to: '/member-signup', label: 'Join' },
  { to: '/member-portal', label: 'Member login' },
  { to: '/shop', label: 'Pro shop' },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkCls = ({ isActive }) =>
    `text-sm font-semibold transition-all duration-150 px-1 pb-0.5 border-b-2 ${
      isActive
        ? 'text-emerald-700 border-emerald-500'
        : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
    }`;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#f8faf6' }}>
      {/* ── Navbar ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: scrolled ? 'rgba(255,255,255,.97)' : '#fff',
          borderBottom: '1px solid #e2ebe5',
          boxShadow: scrolled ? '0 2px 16px rgba(9,32,45,.07)' : 'none',
          backdropFilter: 'blur(10px)',
          transition: 'box-shadow .2s ease, background .2s ease',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'linear-gradient(135deg, #b8df55 0%, #8ab840 100%)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 11, color: '#0e2413',
              boxShadow: '0 3px 10px rgba(184,223,85,.3)',
              flexShrink: 0,
            }}>CC</div>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 15, color: '#0a202d', letterSpacing: '.3px' }}>
              Champions Club
            </span>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="hidden md:flex">
            {NAV_LINKS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={linkCls}>{label}</NavLink>
            ))}
            <Link
              to="/#contact"
              style={{ fontSize: 13, fontWeight: 600, color: '#4a6058', borderBottom: '2px solid transparent', paddingBottom: 2 }}
              className="hover:text-slate-900"
            >Contact</Link>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              to="/login"
              className="hidden md:inline-flex"
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1.5px solid #d0dcd6', background: '#fff',
                fontSize: 12, fontWeight: 700, color: '#3a5048',
                textDecoration: 'none', transition: '.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a8c4b0'; e.currentTarget.style.background = '#f4faf4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0dcd6'; e.currentTarget.style.background = '#fff'; }}
            >
              Staff login
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setOpen(!open)}
              style={{
                background: open ? '#f0f5f0' : 'none', border: '1.5px solid #d0dcd6',
                borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                color: '#3a5048', display: 'flex',
              }}
              className="md:hidden"
              aria-label="Menu"
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {open
                  ? <><path d="M1 1l16 12M17 1L1 13"/></>
                  : <><path d="M0 1h18M0 7h18M0 13h18"/></>
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div style={{
            borderTop: '1px solid #e2ebe5', padding: '12px 24px 20px',
            background: '#fff', animation: 'mobile-menu-in .2s ease',
          }}>
            <style>{`@keyframes mobile-menu-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {NAV_LINKS.map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  onClick={() => setOpen(false)}
                  style={({ isActive }) => ({
                    padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none',
                    background: isActive ? '#edf6d9' : 'none',
                    color: isActive ? '#4a8020' : '#3a5048',
                  })}
                >{label}</NavLink>
              ))}
              <Link
                to="/#contact"
                onClick={() => setOpen(false)}
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#3a5048', textDecoration: 'none' }}
              >Contact</Link>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#3a5048', textDecoration: 'none' }}
              >Staff login</Link>
            </nav>
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #dde8e2', background: '#fff', padding: '40px 24px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, marginBottom: 36 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                <div className="brand-mark" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 10 }}>CC</div>
                <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 13, color: '#0a202d' }}>Champions Club</span>
              </div>
              <p style={{ fontSize: 12, color: '#6b7d74', lineHeight: 1.6, margin: 0 }}>
                Tennis · Padel · Badminton · Cricket<br />Open daily, for everyone.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '1.5px', fontWeight: 800, color: '#8fa59c', marginBottom: 12 }}>PLAY</div>
              {['Book a trial', 'Court rates', 'Friday social', 'Coaching'].map((l) => (
                <div key={l} style={{ fontSize: 12, color: '#4a6058', marginBottom: 7, fontWeight: 500, cursor: 'pointer' }}>{l}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '1.5px', fontWeight: 800, color: '#8fa59c', marginBottom: 12 }}>MEMBERSHIP</div>
              {['Gold plan', 'Silver plan', 'Junior plan', 'Gift a membership'].map((l) => (
                <div key={l} style={{ fontSize: 12, color: '#4a6058', marginBottom: 7, fontWeight: 500, cursor: 'pointer' }}>{l}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '1.5px', fontWeight: 800, color: '#8fa59c', marginBottom: 12 }}>CONTACT</div>
              <div style={{ fontSize: 12, color: '#4a6058', marginBottom: 7 }}>📞 +91 98000 00000</div>
              <div style={{ fontSize: 12, color: '#4a6058', marginBottom: 7 }}>✉ hello@champions.club</div>
              <div style={{ fontSize: 12, color: '#4a6058' }}>📍 Champions Club, City</div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #e8ede9', paddingTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#8fa59c' }}>© {new Date().getFullYear()} Champions Club. All rights reserved.</span>
            <div style={{ display: 'flex', gap: 16 }}>
              {['Privacy', 'Terms', 'Staff login'].map((l) => (
                <span key={l} style={{ fontSize: 11, color: '#8fa59c', cursor: 'pointer', fontWeight: 600 }}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
