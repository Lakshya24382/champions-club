import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { money } from '../components/ui.jsx';

export default function QuotePage() {
  const { token } = useParams();
  const { data: q, isLoading, error } = useQuery({
    queryKey: ['public-quote', token],
    queryFn: () => api(`/public/quotes/${token}`),
  });

  if (isLoading) return <p className="p-6">Loading…</p>;
  if (error) return <p className="p-6 text-red-600">This quote link is not valid.</p>;

  const saving = q.list_price - q.amount;
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <p className="text-sm text-slate-500">Quote {q.quote_no}</p>
      <h1 className="text-3xl font-bold">Hello {q.lead_name}, here's your {q.plan_name} membership</h1>

      <div className="rounded-xl border bg-white p-6">
        <p className="text-4xl font-bold">{money(q.amount)}</p>
        <p className="text-sm text-slate-500">for {q.duration_days} days</p>
        {saving > 0 && <p className="mt-1 text-sm font-medium text-emerald-700">You save {money(saving)} (usual price {money(q.list_price)})</p>}
        {q.message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{q.message}</p>}
        <ul className="mt-4 space-y-1 text-sm">
          <li>✔ {q.court_discount_pct >= 100 ? 'Court bookings included' : `${q.court_discount_pct}% off court bookings`}</li>
          <li>✔ {q.shop_discount_pct}% off in the pro shop</li>
          <li>✔ {q.bar_discount_pct}% off at the bar & cafe</li>
        </ul>
      </div>

      {q.is_expired
        ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">This quote expired on {q.valid_until}. Contact us for a fresh one.</p>
        : q.status === 'accepted'
          ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">This quote has been accepted. Welcome to the club! 🎉</p>
          : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Valid until <b>{q.valid_until}</b>. To accept, visit the front desk or reply to the message we sent you.</p>}

      <Link to="/" className="text-sm text-emerald-700 underline">← Back to the club website</Link>
    </div>
  );
}
