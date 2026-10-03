import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { money, PageLoader } from '../components/ui.jsx';

const BAR_HEIGHTS = [28, 42, 36, 55, 48, 64, 58, 71, 65, 82, 69, 78];

function MiniBar({ pct, delay = 0 }) {
  return (
    <div className="bar-item">
      <div
        className="bar"
        style={{
          height: `${pct}%`,
          animation: `bar-grow .5s cubic-bezier(.4,0,.2,1) ${delay}s both`,
        }}
      />
      <style>{`
        @keyframes bar-grow {
          from { transform: scaleY(0); transform-origin: bottom; opacity: 0; }
          to   { transform: scaleY(1); transform-origin: bottom; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function Dashboard() {
  const { data: s, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api('/dashboard/summary'),
  });
  const { data: ls } = useQuery({
    queryKey: ['leads-summary'],
    queryFn: () => api('/leads/summary'),
  });

  if (isLoading) return <PageLoader />;
  if (!s) return (
    <div className="cc-alert error">
      Could not load dashboard data. Check your connection and refresh.
    </div>
  );

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const attention = ls?.attention_count ?? 0;
  const totalRevToday = s.court_revenue_today + s.shop_revenue_today + s.bar_revenue_today;

  return (
    <>
      {/* Page header */}
      <div className="page-intro">
        <div>
          <div className="eyebrow dark">COURT OPERATIONS</div>
          <h2>Club Overview</h2>
          <p>Today's activity — courts, members, bar and shop at a glance.</p>
        </div>
        <div className="date-card">
          <span>TODAY</span>
          <b>{today}</b>
        </div>
      </div>

      {/* Attention banners */}
      {(attention > 0 || s.low_stock_items > 0) && (
        <div style={{ marginBottom: 20, display: 'grid', gap: 8 }}>
          {attention > 0 && (
            <Link to="/leads">
              <div className="cc-alert warning" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>🔔</span>
                <span>
                  <b>Enquiries need attention —</b> {ls.new_count} new and {ls.due_count} follow-up{ls.due_count !== 1 ? 's' : ''} due today.
                  <span style={{ marginLeft: 8, fontWeight: 800, opacity: .7 }}>View →</span>
                </span>
              </div>
            </Link>
          )}
          {s.low_stock_items > 0 && (
            <Link to="/inventory">
              <div className="cc-alert error" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>⚠</span>
                <span>
                  <b>Low stock:</b> {s.low_stock_items} product{s.low_stock_items > 1 ? 's are' : ' is'} running low.
                  <span style={{ marginLeft: 8, fontWeight: 800, opacity: .7 }}>Review →</span>
                </span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="kpi-grid">
        {[
          { to: '/bookings', icon: '📅', color: 'green', label: 'BOOKINGS TODAY', value: s.bookings_today, sub: 'Live court schedule' },
          { to: '/members',  icon: '🎾', color: 'blue',  label: 'ACTIVE MEMBERS', value: s.active_members, sub: 'Current membership base' },
          { to: null,        icon: '₹',  color: 'purple',label: 'REVENUE TODAY',  value: money(totalRevToday), sub: 'All areas combined' },
          { to: '/inventory',icon: '⚠',  color: 'amber', label: 'LOW STOCK',      value: s.low_stock_items, sub: 'Items need attention' },
        ].map(({ to, icon, color, label, value, sub }, i) => {
          const card = (
            <div className="kpi" style={{ animationDelay: `${i * .06}s` }}>
              <span className={`kpi-icon ${color}`}>{icon}</span>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{sub}</em>
            </div>
          );
          return to ? <Link key={label} to={to} style={{ textDecoration: 'none' }}>{card}</Link> : <div key={label}>{card}</div>;
        })}
      </div>

      {/* Main grid */}
      <div className="dashboard-layout">
        {/* Left column */}
        <div style={{ display: 'grid', gap: 18 }}>

          {/* Revenue */}
          <section className="panel revenue-panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">FINANCIAL SNAPSHOT</div>
                <h3>Revenue overview</h3>
                <p>Current recorded sales by business area.</p>
              </div>
              <Link to="/finance" className="link-btn">View reports →</Link>
            </div>
            <div className="revenue-chart">
              <div className="revenue-number">
                <strong>{money(totalRevToday)}</strong>
                <span>Today's recorded revenue</span>
                <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                  {[
                    { label: 'Courts', value: s.court_revenue_today, color: '#8ab84a' },
                    { label: 'Shop',   value: s.shop_revenue_today,  color: '#5fa8c8' },
                    { label: 'Bar',    value: s.bar_revenue_today,   color: '#d4a438' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{money(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bars">
                {BAR_HEIGHTS.map((h, i) => <MiniBar key={i} pct={h} delay={i * .03} />)}
              </div>
            </div>
          </section>

          {/* Area breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { label: 'Courts', today: s.court_revenue_today, month: s.court_revenue_month, link: '/bookings', color: '#edf6d9', dot: '#8ab84a', icon: '📅' },
              { label: 'Shop',   today: s.shop_revenue_today,  month: s.shop_revenue_month,  link: '/pos',      color: '#e4f0f6', dot: '#5fa8c8', icon: '🛒' },
              { label: 'Bar',    today: s.bar_revenue_today,   month: s.bar_revenue_month,   link: '/bar',      color: '#faf0d8', dot: '#d4a438', icon: '🍺' },
            ].map(({ label, today: t, month: m, link, color, dot, icon }) => (
              <Link key={label} to={link} style={{ textDecoration: 'none' }}>
                <div className="panel" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div className="section-kicker">{label.toUpperCase()}</div>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: color, display: 'grid', placeItems: 'center', fontSize: 14 }}>{icon}</div>
                  </div>
                  <div style={{ fontFamily: 'Manrope', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{money(t)}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 4 }}>
                    Today · <span style={{ fontWeight: 700 }}>{money(m)}</span> this month
                  </div>
                  <div style={{ marginTop: 12, height: 3, borderRadius: 3, background: 'var(--line2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: dot, width: `${Math.min(100, (t / (m || 1)) * 100 * 30)}%`, transition: 'width 1s ease' }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Enquiries */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">CRM PIPELINE</div>
                <h3>Enquiries & Growth</h3>
              </div>
              <Link to="/leads" className="link-btn">Manage →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'NEW',       value: ls?.new_count ?? 0,       bg: '#e4f0f6', color: '#2d6882' },
                { label: 'DUE TODAY', value: ls?.due_count ?? 0,       bg: '#faf0d8', color: '#9b7025' },
                { label: 'OPEN',      value: ls?.open_count ?? 0,      bg: '#f2f5f1', color: '#4a6058' },
                { label: 'CONVERTED', value: ls?.converted_month ?? 0, bg: '#edf6d9', color: '#5a8020' },
              ].map(({ label, value, bg, color }) => (
                <div key={label} style={{ textAlign: 'center', padding: '14px 8px', background: bg, borderRadius: 10 }}>
                  <div style={{ fontSize: 8, letterSpacing: '1.2px', fontWeight: 800, color }}>{label}</div>
                  <div style={{ fontFamily: 'Manrope', fontSize: 28, fontWeight: 800, margin: '8px 0 0', color: 'var(--ink)' }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Members */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">MEMBERSHIP</div>
                <h3>Member status</h3>
              </div>
              <Link to="/members" className="link-btn">All members →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'ACTIVE',   value: s.active_members,  pillCls: 'success' },
                { label: 'EXPIRING', value: s.expiring_soon,   pillCls: 'amber'   },
                { label: 'EXPIRED',  value: s.expired_members, pillCls: 'danger'  },
                { label: 'TOTAL',    value: s.total_members,   pillCls: 'info'    },
              ].map(({ label, value, pillCls }) => (
                <div key={label} style={{ textAlign: 'center', padding: '14px 8px', background: 'var(--line2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 8, letterSpacing: '1.2px', fontWeight: 800, color: 'var(--muted)' }}>{label}</div>
                  <div style={{ fontFamily: 'Manrope', fontSize: 28, fontWeight: 800, margin: '8px 0 8px', color: 'var(--ink)' }}>{value}</div>
                  <span className={`pill ${pillCls}`}>{label.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right sidebar */}
        <aside className="dashboard-side">
          {/* Quick actions */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">SHORTCUTS</div>
                <h3>Quick actions</h3>
              </div>
            </div>
            <div className="action-grid">
              {[
                { to: '/bookings', icon: '📅', color: 'green',  label: 'New booking', sub: 'Court reservation' },
                { to: '/members',  icon: '🎾', color: 'blue',   label: 'Add member',  sub: 'Membership CRM' },
                { to: '/pos',      icon: '🛒', color: 'purple', label: 'Shop sale',   sub: 'Inventory & POS' },
                { to: '/bar',      icon: '🍺', color: 'amber',  label: 'Bar order',   sub: 'Cafeteria POS' },
              ].map(({ to, icon, color, label, sub }) => (
                <Link key={to} to={to} className="action-item">
                  <span className={`action-icon ${color}`}>{icon}</span>
                  <b>{label}</b>
                  <small>{sub}</small>
                </Link>
              ))}
            </div>
          </section>

          {/* Club watch */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">ATTENTION</div>
                <h3>Club watch</h3>
              </div>
            </div>
            <div className="watch-list">
              <div className="watch-row">
                <span className="watch-mark amber">⚠</span>
                <div>
                  <b>{s.low_stock_items} low-stock item{s.low_stock_items !== 1 ? 's' : ''}</b>
                  <small>Review inventory</small>
                </div>
                <Link to="/inventory">→</Link>
              </div>
              <div className="watch-row">
                <span className="watch-mark blue">✉</span>
                <div>
                  <b>{attention} enqu{attention !== 1 ? 'iries' : 'iry'} pending</b>
                  <small>Leads & CRM</small>
                </div>
                <Link to="/leads">→</Link>
              </div>
              <div className="watch-row">
                <span className="watch-mark amber">⏳</span>
                <div>
                  <b>{s.expiring_soon} membership{s.expiring_soon !== 1 ? 's' : ''} expiring</b>
                  <small>Within 30 days</small>
                </div>
                <Link to="/members">→</Link>
              </div>
              {s.open_tabs > 0 && (
                <div className="watch-row">
                  <span className="watch-mark blue">🍺</span>
                  <div>
                    <b>{s.open_tabs} open bar tab{s.open_tabs !== 1 ? 's' : ''}</b>
                    <small>Unpaid</small>
                  </div>
                  <Link to="/bar">→</Link>
                </div>
              )}
              <div className="watch-row">
                <span className="watch-mark green">✓</span>
                <div>
                  <b>System online</b>
                  <small>All services responding</small>
                </div>
                <span className="ok-pill">OK</span>
              </div>
            </div>
          </section>

          {s.open_online_orders > 0 && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <div className="section-kicker">SHOP</div>
                  <h3>Online orders</h3>
                </div>
                <Link to="/orders" className="link-btn">View all →</Link>
              </div>
              <div className="watch-row" style={{ borderTop: 0 }}>
                <span className="watch-mark amber">📦</span>
                <div>
                  <b>{s.open_online_orders} open order{s.open_online_orders !== 1 ? 's' : ''}</b>
                  <small>Awaiting fulfilment</small>
                </div>
                <Link to="/orders">→</Link>
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
