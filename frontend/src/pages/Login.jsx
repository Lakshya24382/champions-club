import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('owner@champions.club');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      {/* Left — visual panel */}
      <div className="login-visual">
        <div className="login-brand">
          <div className="brand-mark">CC</div>
          <div className="login-brand-text">
            <b>CHAMPIONS</b>
            <small>CLUB MANAGEMENT</small>
          </div>
        </div>

        <div className="login-hero">
          <div className="eyebrow">STAFF PORTAL</div>
          <h1>Manage your<br /><em>club</em> smarter.</h1>
          <p>
            Courts, members, bar, shop, finance — everything you need to run
            Champions Club, in one place.
          </p>
        </div>

        <div className="visual-grid">
          <div className="visual-card">
            <div className="court-art"><span /></div>
            <b>COURTS</b>
            <small>LIVE SCHEDULE</small>
          </div>
          <div className="visual-card">
            <div className="ball-art"><span /></div>
            <b>MEMBERS</b>
            <small>CRM &amp; PLANS</small>
          </div>
          <div className="visual-card">
            <div className="club-art"><span>CC</span></div>
            <b>FINANCE</b>
            <small>REPORTS &amp; P&amp;L</small>
          </div>
        </div>

        <div className="login-stat-strip">
          <div className="login-stat"><b>4</b><small>SPORTS</small></div>
          <div className="login-stat"><b>∞</b><small>BOOKINGS</small></div>
          <div className="login-stat"><b>24/7</b><small>AVAILABLE</small></div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <div className="brand-mark" style={{ width: 36, height: 36, borderRadius: 9, fontSize: 11 }}>CC</div>
            <span className="secure-pill">🔒 SECURE LOGIN</span>
          </div>

          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to access Club Management</p>

          <form onSubmit={submit}>
            <label className="login-field-label">Email address</label>
            <input
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <label className="login-field-label">Password</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to Club Management'}
              <span className="login-submit-arrow">→</span>
            </button>
          </form>

          <div className="login-footer">
            <span>v2.0 · Champions Club</span>
            <b>Staff only</b>
          </div>

          <a href="/" className="back-to-site">← Back to public website</a>
        </div>
      </div>
    </div>
  );
}
