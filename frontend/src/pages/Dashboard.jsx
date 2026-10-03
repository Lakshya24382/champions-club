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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Today at the club</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Bookings today" value={s.bookings_today} to="/bookings" />
        <Card label="Court revenue today" value={money(s.court_revenue_today)} />
        <Card label="Court revenue (month)" value={money(s.court_revenue_month)} />
        <Card label="Active members" value={s.active_members} to="/members" />
        <Card label="Expiring in 30 days" value={s.expiring_soon} to="/members" tone="border-amber-300" />
        <Card label="Expired" value={s.expired_members} to="/members" tone="border-red-300" />
        <Card label="Total members" value={s.total_members} />
      </div>
      <p className="text-sm text-slate-500">Shop, bar and finance totals join this dashboard in later phases.</p>
    </div>
  );
}
