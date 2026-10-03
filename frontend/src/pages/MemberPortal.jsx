/**
 * FIX 7: Member Login Portal
 * Members log in with their member code + phone number (no password needed).
 * Shows their profile, active bookings, discount summary.
 */
import { useState, createContext, useContext } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, setToken, getToken } from '../api';

const MemberAuthContext = createContext(null);
export const useMemberAuth = () => useContext(MemberAuthContext);

function MemberLogin({ onLogin }) {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api('/auth/member-login', {
        method: 'POST',
        body: { memberCode: code.trim().toUpperCase(), phone: phone.trim() },
      });
      localStorage.setItem('cc_member_token', r.token);
      onLogin(r.member);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a202b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, padding: 40, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div className="brand-mark" style={{ width: 44, height: 44 }}>CC</div>
          <div>
            <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 15 }}>CHAMPIONS CLUB</div>
            <div style={{ fontSize: 10, color: '#718079', letterSpacing: 1 }}>MEMBER PORTAL</div>
          </div>
        </div>

        <h2 style={{ fontFamily: 'Manrope', fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>Member sign-in</h2>
        <p style={{ fontSize: 12, color: '#77847e', margin: '0 0 24px' }}>Use your membership code and registered phone number</p>

        <form onSubmit={submit}>
          <label className="login-field-label">Membership code</label>
          <input className="login-input" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="CC-00001" required style={{ textTransform: 'uppercase' }} />

          <label className="login-field-label">Phone number</label>
          <input className="login-input" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="9800000000" required />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Checking…' : 'Access My Account'}
            <span className="login-submit-arrow">→</span>
          </button>
        </form>

        <p style={{ fontSize: 10, color: '#9aada6', textAlign: 'center', marginTop: 16 }}>
          Your member code is on your membership card or welcome email.
        </p>
        <a href="/" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 10, color: '#6c8c2b', fontWeight: 800 }}>
          ← Back to website
        </a>
      </div>
    </div>
  );
}

function MemberDashboard({ member, onLogout }) {
  const memberToken = localStorage.getItem('cc_member_token');
  const { data: bookings = [], isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ['member-bookings', member.id],
    queryFn: () => api('/member/bookings', { authToken: memberToken }),
    enabled: !!memberToken,
  });

  const info = member;
  const expiresDate = new Date(info.expires_on);
  const daysLeft = Math.ceil((expiresDate - new Date()) / 86400000);
  const isExpiring = daysLeft <= 30;
  const isExpired = daysLeft < 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f3', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header style={{ background: '#0a202b', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark">CC</div>
          <div>
            <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 13 }}>CHAMPIONS CLUB</div>
            <div style={{ fontSize: 9, color: '#8fa69d', letterSpacing: 1 }}>MEMBER PORTAL</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
        {/* Welcome */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Manrope', fontSize: 28, fontWeight: 800, margin: '0 0 4px', color: '#0a202b' }}>
            Welcome, {info.full_name.split(' ')[0]}! 👋
          </h1>
          <p style={{ color: '#718079', fontSize: 14 }}>
            Member code: <b style={{ fontFamily: 'monospace', color: '#0a202b' }}>{info.member_code}</b>
          </p>
        </div>

        {/* Membership card */}
        <div style={{ background: 'linear-gradient(135deg, #0a202b 0%, #1c4032 100%)', borderRadius: 20, padding: 28, color: '#fff', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(184,223,85,.08)' }} />
          <div style={{ position: 'absolute', right: 30, top: 30, width: 60, height: 60, borderRadius: '50%', background: 'rgba(184,223,85,.06)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 10, color: '#8fa69d', letterSpacing: 1.5, marginBottom: 8 }}>MEMBERSHIP PLAN</div>
              <div style={{ fontFamily: 'Manrope', fontSize: 22, fontWeight: 800, color: '#b8df55' }}>{info.plan_name}</div>
              <div style={{ fontSize: 12, color: '#8fa69d', marginTop: 4 }}>{info.plan_code} · {info.full_name}</div>
            </div>
            <div className="brand-mark" style={{ background: 'rgba(184,223,85,.15)', color: '#b8df55', fontFamily: 'Manrope', fontWeight: 800 }}>CC</div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 32 }}>
            <div>
              <div style={{ fontSize: 9, color: '#8fa69d', letterSpacing: 1.5 }}>VALID UNTIL</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isExpired ? '#f87171' : isExpiring ? '#fbbf24' : '#fff' }}>
                {info.expires_on}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#8fa69d', letterSpacing: 1.5 }}>STATUS</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isExpired ? '#f87171' : isExpiring ? '#fbbf24' : '#b8df55' }}>
                {isExpired ? 'EXPIRED' : isExpiring ? `${daysLeft} DAYS LEFT` : 'ACTIVE'}
              </div>
            </div>
          </div>
        </div>

        {isExpired && (
          <div style={{ background: '#fae5e5', border: '1px solid #f9c9c9', borderRadius: 12, padding: 16, marginBottom: 20, color: '#984848' }}>
            <b>Your membership has expired.</b> Please visit the front desk or call us to renew.
          </div>
        )}

        {/* Discounts */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, border: '1px solid #dfe6e2' }}>
          <h2 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 15, margin: '0 0 16px', color: '#0a202b' }}>
            Your member benefits
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Court bookings', pct: info.court_discount_pct, icon: '🎾' },
              { label: 'Shop purchases', pct: info.shop_discount_pct, icon: '🛒' },
              { label: 'Bar & cafeteria', pct: info.bar_discount_pct, icon: '🍺' },
            ].map(({ label, pct, icon }) => (
              <div key={label} style={{ textAlign: 'center', background: '#f4f6f3', borderRadius: 12, padding: '16px 8px' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 22, color: '#0a202b' }}>
                  {pct === 100 ? 'FREE' : pct > 0 ? `${pct}% off` : 'Standard rate'}
                </div>
                <div style={{ fontSize: 11, color: '#718079', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming bookings */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, border: '1px solid #dfe6e2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 15, margin: 0, color: '#0a202b' }}>My court bookings</h2>
            <a href="/book" style={{ fontSize: 12, color: '#6c8c2b', fontWeight: 800 }}>View courts →</a>
          </div>
          {bookingsLoading ? <p style={{ color: '#718079', fontSize: 12, marginTop: 12 }}>Loading bookings…</p> : bookingsError ? (
            <p style={{ color: '#984848', fontSize: 12, marginTop: 12 }}>
              {bookingsError.message || 'Unable to load your bookings.'}
            </p>
          ) : bookings.length === 0 ? (
            <p style={{ color: '#718079', fontSize: 12, marginTop: 12 }}>No bookings yet.</p>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {bookings.filter((b) => b.status === 'confirmed').slice(0, 5).map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 10, background: '#f4f6f3', fontSize: 12 }}>
                  <span><b>{b.court_name}</b> · {b.start_at}–{b.end_time}</span>
                  <b>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(b.price ?? 0)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #dfe6e2' }}>
          <h2 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 15, margin: '0 0 16px', color: '#0a202b' }}>
            Quick links
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { href: '/book', label: '📅 View available courts', desc: 'Check what\'s free this week' },
              { href: '/shop', label: '🛒 Shop online', desc: 'Order gear for pickup or delivery' },
              { href: '/#contact', label: '📞 Contact the club', desc: 'Speak to the front desk' },
              { href: '/#plans', label: '♻ Renew membership', desc: 'See plan options and pricing' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: 16, borderRadius: 12, border: '1px solid #dfe6e2', textDecoration: 'none', color: 'inherit', transition: '.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#b8df55'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#dfe6e2'}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#718079' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9aada6', marginTop: 24 }}>
          Champions Club Member Portal · Questions? Call the front desk.
        </p>
      </main>
    </div>
  );
}

export default function MemberPortal() {
  const [member, setMember] = useState(() => {
    try {
      const token = localStorage.getItem('cc_member_token');
      if (!token) return null;
      // Decode payload
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { localStorage.removeItem('cc_member_token'); return null; }
      return payload;
    } catch { return null; }
  });

  if (!member) return <MemberLogin onLogin={(m) => setMember(m)} />;
  return <MemberDashboard member={member} onLogout={() => { localStorage.removeItem('cc_member_token'); setMember(null); }} />;
}
