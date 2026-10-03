import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { money } from '../components/ui.jsx';

const mini = 'rounded border px-2 py-1 text-xs font-medium uppercase hover:bg-emerald-50 disabled:opacity-50';

function PayButtons({ path, id }) {
  const qc = useQueryClient();
  const pay = useMutation({
    mutationFn: (method) => api(`/finance/collections/${path}/${id}/pay`, { method: 'POST', body: { method } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['fin-report'] });
    },
  });
  return (
    <span className="flex items-center gap-1">
      {['cash', 'card', 'upi'].map((m) => (
        <button key={m} className={mini} disabled={pay.isPending} onClick={() => pay.mutate(m)}>{m}</button>
      ))}
      {pay.error && <span className="text-xs text-red-600">{pay.error.message}</span>}
    </span>
  );
}

export default function Collections() {
  const { data, isLoading } = useQuery({ queryKey: ['collections'], queryFn: () => api('/finance/collections') });
  if (isLoading) return <p>Loading…</p>;
  if (!data) return (
    <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Could not load collections. Please refresh the page.
    </p>
  );

  const owedB = data.bookings.reduce((a, b) => a + b.price, 0);
  const owedM = data.memberships.reduce((a, m) => a + m.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Collections</h1>
        <p className="mt-1 text-sm text-slate-600">
          Court bookings and memberships don't record <i>how</i> they were paid at the desk. Tap cash, card or UPI here so the owner's
          report can show a true split by payment method. Free (Gold) bookings aren't listed.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">Court sessions already played ({money(owedB)} untagged)</h2>
        {data.bookings.length === 0 && <p className="text-sm text-slate-500">All tagged. 🎉</p>}
        <ul className="divide-y text-sm">
          {data.bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{b.player}</b>{b.member_code && ` (${b.member_code})`} · {b.court_name}{b.kind === 'social' && ' (social)'}
                <br /><span className="text-xs text-slate-500">{new Date(b.start_at).toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-3"><b>{money(b.price)}</b><PayButtons path="bookings" id={b.id} /></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 font-semibold">Membership payments ({money(owedM)} untagged)</h2>
        {data.memberships.length === 0 && <p className="text-sm text-slate-500">All tagged. 🎉</p>}
        <ul className="divide-y text-sm">
          {data.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{m.full_name}</b> ({m.member_code}) · <span className="capitalize">{m.event_type.replace('_', ' ')}</span> · {m.plan_name}
                <br /><span className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-3"><b>{money(m.amount)}</b><PayButtons path="memberships" id={m.id} /></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
