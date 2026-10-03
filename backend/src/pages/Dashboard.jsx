import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { money } from '../components/ui.jsx';

function Card({ label, value, to, tone = '' }) {
  const body = (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const { data: s, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard/summary') });
  if (isLoading) return <p>Loading…</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Today at the club</h1>

      {s.low_stock_items > 0 && (
        <Link to="/inventory" className="block rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          ⚠️ {s.low_stock_items} product{s.low_stock_items > 1 ? 's are' : ' is'} running low on stock. Click to review.
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Courts</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Bookings today" value={s.bookings_today} to="/bookings" />
          <Card label="Court revenue today" value={money(s.court_revenue_today)} />
          <Card label="Court revenue (month)" value={money(s.court_revenue_month)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Shop</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Shop revenue today" value={money(s.shop_revenue_today)} />
          <Card label="Shop revenue (month)" value={money(s.shop_revenue_month)} />
          <Card label="Open online orders" value={s.open_online_orders} to="/orders" tone={s.open_online_orders ? 'border-amber-300' : ''} />
          <Card label="Low-stock items" value={s.low_stock_items} to="/inventory" tone={s.low_stock_items ? 'border-red-300' : ''} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Members</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Active members" value={s.active_members} to="/members" />
          <Card label="Expiring in 30 days" value={s.expiring_soon} to="/members" tone="border-amber-300" />
          <Card label="Expired" value={s.expired_members} to="/members" tone="border-red-300" />
          <Card label="Total members" value={s.total_members} />
        </div>
      </section>
      <p className="text-sm text-slate-500">Bar and finance totals join this dashboard in later phases.</p>
    </div>
  );
}
