import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { money, PageLoader, Alert } from '../components/ui.jsx';

function StatCard({ label, value, sub, to, tone = '' }) {
  const body = (
    <div
      className={`group rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${tone}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
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

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today at the club</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Attention banners */}
      {(ls?.attention_count > 0 || s.low_stock_items > 0) && (
        <div className="space-y-2">
          {ls?.attention_count > 0 && (
            <Link to="/leads">
              <Alert type="warning">
                <span className="font-semibold">Enquiries need attention:</span>{' '}
                {ls.new_count} new {ls.new_count === 1 ? 'enquiry' : 'enquiries'} and{' '}
                {ls.due_count} follow-up{ls.due_count === 1 ? '' : 's'} due today.
              </Alert>
            </Link>
          )}
          {s.low_stock_items > 0 && (
            <Link to="/inventory">
              <Alert type="error">
                <span className="font-semibold">Low stock:</span>{' '}
                {s.low_stock_items} product{s.low_stock_items > 1 ? 's are' : ' is'} running low.
                Review inventory.
              </Alert>
            </Link>
          )}
        </div>
      )}

      {/* Stats sections */}
      <Section title="Enquiries & growth">
        <StatCard
          label="New enquiries"
          value={ls?.new_count ?? 0}
          to="/leads"
          tone={ls?.new_count ? 'border-amber-300 hover:border-amber-400' : ''}
        />
        <StatCard
          label="Follow-ups due"
          value={ls?.due_count ?? 0}
          to="/leads"
          tone={ls?.due_count ? 'border-amber-300 hover:border-amber-400' : ''}
        />
        <StatCard label="Open enquiries" value={ls?.open_count ?? 0} to="/leads" />
        <StatCard label="Converted this month" value={ls?.converted_month ?? 0} />
      </Section>

      <Section title="Courts">
        <StatCard label="Bookings today" value={s.bookings_today} to="/bookings" />
        <StatCard label="Court revenue today" value={money(s.court_revenue_today)} />
        <StatCard label="Court revenue (month)" value={money(s.court_revenue_month)} />
      </Section>

      <Section title="Shop">
        <StatCard label="Shop revenue today" value={money(s.shop_revenue_today)} />
        <StatCard label="Shop revenue (month)" value={money(s.shop_revenue_month)} />
        <StatCard
          label="Open online orders"
          value={s.open_online_orders}
          to="/orders"
          tone={s.open_online_orders ? 'border-amber-300 hover:border-amber-400' : ''}
        />
        <StatCard
          label="Low-stock items"
          value={s.low_stock_items}
          to="/inventory"
          tone={s.low_stock_items ? 'border-red-300 hover:border-red-400' : ''}
        />
      </Section>

      <Section title="Bar & cafeteria">
        <StatCard label="Bar revenue today" value={money(s.bar_revenue_today)} to="/bar" />
        <StatCard label="Bar revenue (month)" value={money(s.bar_revenue_month)} />
        <StatCard
          label="Open tabs"
          value={s.open_tabs}
          to="/bar"
          tone={s.open_tabs ? 'border-amber-300 hover:border-amber-400' : ''}
          sub={s.open_tabs ? 'Unpaid' : undefined}
        />
      </Section>

      <Section title="Members">
        <StatCard label="Active members" value={s.active_members} to="/members" />
        <StatCard
          label="Expiring in 30 days"
          value={s.expiring_soon}
          to="/members"
          tone="border-amber-300 hover:border-amber-400"
        />
        <StatCard
          label="Expired"
          value={s.expired_members}
          to="/members"
          tone="border-red-300 hover:border-red-400"
        />
        <StatCard label="Total members" value={s.total_members} />
      </Section>
    </div>
  );
}
