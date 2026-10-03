import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { money, PageLoader } from '../components/ui.jsx';

const BAR_HEIGHTS = [32, 46, 39, 58, 51, 67, 61, 74, 68, 86, 72, 80];

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
    <div className="cc-alert error" style={{ marginTop: 24 }}>
      Could not load dashboard data. Check your connection and refresh the page.
    </div>
  );

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const attention = ls?.attention_count ?? 0;

  return (
    <>
      {/* Page intro */}
      <div className="page-intro">
        <div>
          <div className="eyebrow dark">COURT OPERATIONS</div>
          <h2>Club Overview</h2>
          <p>Monitor today's activity — members, bookings, bar, and shop at a glance.</p>
        </div>
        <div className="date-card">
          <span>TODAY</span>
          <b>{today}</b>
        </div>
      </div>

      {/* Attention banners */}
      {(attention > 0 || s.low_stock_items > 0) && (
        <div style={{ marginBottom: 18, display: 'grid', gap: 8 }}>
          {attention > 0 && (
            <Link to="/leads">
              <div className="cc-alert warning">
                <b>Enquiries need attention —</b> {ls.new_count} new{' '}
                {ls.new_count === 1 ? 'enquiry' : 'enquiries'} and {ls.due_count} follow-up
                {ls.due_count === 1 ? '' : 's'} due today.
              </div>
            </Link>
          )}
          {s.low_stock_items > 0 && (
            <Link to="/inventory">
              <div className="cc-alert error">
                <b>Low stock:</b> {s.low_stock_items} product
                {s.low_stock_items > 1 ? 's are' : ' is'} running low. Review inventory.
              </div>
            </Link>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="kpi-grid">
        <Link to="/bookings" style={{ textDecoration: 'none' }}>
          <div className="kpi">
            <span className="kpi-icon green">▦</span>
            <small>BOOKINGS TODAY</small>
            <strong>{s.bookings_today}</strong>
            <em>Live court schedule</em>
          </div>
        </Link>
        <Link to="/members" style={{ textDecoration: 'none' }}>
          <div className="kpi">
            <span className="kpi-icon blue">♙</span>
            <small>ACTIVE MEMBERS</small>
            <strong>{s.active_members}</strong>
            <em>Current membership base</em>
          </div>
        </Link>
        <div className="kpi">
          <span className="kpi-icon purple">₹</span>
          <small>REVENUE TODAY</small>
          <strong>{money(s.court_revenue_today + s.shop_revenue_today + s.bar_revenue_today)}</strong>
          <em>All areas combined</em>
        </div>
        <Link to="/inventory" style={{ textDecoration: 'none' }}>
          <div className="kpi">
            <span className="kpi-icon amber">!</span>
            <small>LOW STOCK</small>
            <strong>{s.low_stock_items}</strong>
            <em>Items need attention</em>
          </div>
        </Link>
      </div>

      {/* Main grid */}
      <div className="dashboard-layout">
        {/* Left column */}
        <div style={{ display: 'grid', gap: 18 }}>

          {/* Revenue overview */}
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
                <strong>{money(s.court_revenue_today + s.shop_revenue_today + s.bar_revenue_today)}</strong>
                <span>Today's recorded revenue</span>
              </div>
              <div className="bars">
                {BAR_HEIGHTS.map((h, i) => (
                  <div key={i} className="bar-item">
                    <div className="bar" style={{ height: `${h}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Area breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { label: 'Courts', icon: '▦', color: 'green', today: s.court_revenue_today, month: s.court_revenue_month, link: '/bookings' },
              { label: 'Shop',   icon: '□', color: 'blue',  today: s.shop_revenue_today,  month: s.shop_revenue_month,  link: '/pos' },
              { label: 'Bar',    icon: '◈', color: 'amber', today: s.bar_revenue_today,   month: s.bar_revenue_month,   link: '/bar' },
            ].map(({ label, icon, color, today: t, month: m, link }) => (
              <Link key={label} to={link} style={{ textDecoration: 'none' }}>
                <div className="panel" style={{ padding: '15px' }}>
                  <div className="panel-title" style={{ marginBottom: 10 }}>
                    <div className="section-kicker">{label.toUpperCase()}</div>
                    <span className={`action-icon ${color}`} style={{ width: 26, height: 26, borderRadius: 7, fontSize: 11 }}>{icon}</span>
                  </div>
                  <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 22, fontWeight: 800 }}>{money(t)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>Today · {money(m)} this month</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Enquiries */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <div className="section-kicker">CRM</div>
                <h3>Enquiries & Growth</h3>
              </div>
              <Link to="/leads" className="link-btn">Manage enquiries →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'NEW', value: ls?.new_count ?? 0, sub: 'Enquiries' },
                { label: 'DUE', value: ls?.due_count ?? 0, sub: 'Follow-ups today' },
                { label: 'OPEN', value: ls?.open_count ?? 0, sub: 'In pipeline' },
                { label: 'CONVERTED', value: ls?.converted_month ?? 0, sub: 'This month' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ textAlign: 'center', padding: '12px 8px', background: '#f7f9f7', borderRadius: 9 }}>
                  <div style={{ fontSize: 8, letterSpacing: '1px', fontWeight: 800, color: '#7a8b84' }}>{label}</div>
                  <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 24, fontWeight: 800, margin: '6px 0 2px' }}>{value}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{sub}</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'ACTIVE',   value: s.active_members,   color: 'success' },
                { label: 'EXPIRING', value: s.expiring_soon,    color: 'amber' },
                { label: 'EXPIRED',  value: s.expired_members,  color: 'danger' },
                { label: 'TOTAL',    value: s.total_members,    color: 'info' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center', padding: '12px 8px', background: '#f7f9f7', borderRadius: 9 }}>
                  <div style={{ fontSize: 8, letterSpacing: '1px', fontWeight: 800, color: '#7a8b84' }}>{label}</div>
                  <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 24, fontWeight: 800, margin: '6px 0 2px' }}>{value}</div>
                  <span className={`pill ${color}`}>{label.toLowerCase()}</span>
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
              <Link to="/bookings" className="action-item">
                <span className="action-icon green">＋</span>
                <b>New booking</b>
                <small>Court reservation</small>
              </Link>
              <Link to="/members" className="action-item">
                <span className="action-icon blue">♙</span>
                <b>Add member</b>
                <small>Membership CRM</small>
              </Link>
              <Link to="/pos" className="action-item">
                <span className="action-icon purple">□</span>
                <b>Shop sale</b>
                <small>Inventory &amp; POS</small>
              </Link>
              <Link to="/bar" className="action-item">
                <span className="action-icon amber">◈</span>
                <b>Bar order</b>
                <small>Cafeteria POS</small>
              </Link>
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
                <span className="watch-mark amber">!</span>
                <div>
                  <b>{s.low_stock_items} low-stock item{s.low_stock_items !== 1 ? 's' : ''}</b>
                  <small>Review inventory</small>
                </div>
                <Link to="/inventory">→</Link>
              </div>
              <div className="watch-row">
                <span className="watch-mark blue">✉</span>
                <div>
                  <b>{attention} enquir{attention !== 1 ? 'ies' : 'y'} pending</b>
                  <small>Leads &amp; CRM</small>
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
                  <span className="watch-mark amber">◈</span>
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

          {/* Online orders */}
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
                <span className="watch-mark amber">◫</span>
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
