import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Field, inputCls, btnCls, StatusBadge, PlanBadge, money } from '../components/ui.jsx';

export default function MemberDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [planId, setPlanId] = useState('');

  const { data: m, isLoading } = useQuery({ queryKey: ['member', id], queryFn: () => api(`/members/${id}`) });
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });

  const renew = useMutation({
    mutationFn: () => api(`/members/${id}/renew`, {
      method: 'POST',
      body: { planId: planId ? Number(planId) : undefined },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (isLoading) return <p>Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/members" className="text-sm text-emerald-700 hover:underline">← All members</Link>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{m.full_name}</h1>
            <p className="font-mono text-sm text-slate-500">{m.member_code}</p>
          </div>
          <div className="flex gap-2"><PlanBadge code={m.plan_code} name={m.plan_name} /><StatusBadge status={m.membership_status} /></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-slate-500">Phone</dt><dd>{m.phone}</dd></div>
          <div><dt className="text-slate-500">Email</dt><dd>{m.email ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Joined</dt><dd>{m.joined_on}</dd></div>
          <div><dt className="text-slate-500">Expires</dt><dd className="font-semibold">{m.expires_on}</dd></div>
        </dl>
        <p className="mt-4 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
          Entitlements: Courts {m.court_discount_pct}% off · Shop {m.shop_discount_pct}% off · Bar {m.bar_discount_pct}% off
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Renew or change plan</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Plan">
            <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Keep current ({m.plan_name})</option>
              {plans.filter((p) => p.id !== m.plan_id).map((p) => <option key={p.id} value={p.id}>Switch to {p.name} · {money(p.price)}</option>)}
            </select>
          </Field>
          <button className={btnCls} disabled={renew.isPending} onClick={() => renew.mutate()}>
            {planId ? 'Change plan' : 'Renew'}
          </button>
        </div>
        {renew.error && <p className="mt-2 text-sm text-red-600">{renew.error.message}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-semibold">Membership history</h2>
          <ul className="space-y-2 text-sm">
            {m.events.map((e) => (
              <li key={e.id} className="flex justify-between border-b pb-2">
                <span><b className="capitalize">{e.event_type.replace('_', ' ')}</b> · {e.plan_name}<br /><span className="text-slate-500">{e.starts_on} → {e.ends_on}</span></span>
                <span>{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-semibold">Recent court bookings</h2>
          {m.bookings.length === 0 && <p className="text-sm text-slate-500">No bookings yet.</p>}
          <ul className="space-y-2 text-sm">
            {m.bookings.map((b) => (
              <li key={b.id} className="flex justify-between border-b pb-2">
                <span>{b.court_name}{b.kind === 'social' && ' (social)'}<br /><span className="text-slate-500">{new Date(b.start_at).toLocaleString()}</span></span>
                <span className={b.status === 'cancelled' ? 'text-red-500 line-through' : ''}>{money(b.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
