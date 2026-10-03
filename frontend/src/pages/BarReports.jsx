import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { inputCls, money } from '../components/ui.jsx';

const todayStr = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD in local time

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function BarReports() {
  const [date, setDate] = useState(todayStr());

  const { data: r, error, isLoading } = useQuery({
    queryKey: ['bar-report', date],
    queryFn: () => api(`/bar/reports/daily?date=${date}`),
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ['bar-shifts', date],
    queryFn: () => api(`/bar/shifts?date=${date}`),
  });

  if (error) return <p className="text-red-600">{error.message}</p>;
  if (isLoading) return <p>Loading…</p>;

  const method = (m) => r.by_method.find((x) => x.method === m)?.total ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bar earnings</h1>
        <input type="date" className={`${inputCls} max-w-[11rem]`} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Earned (net)" value={money(r.net)} tone="border-emerald-300" />
        <Stat label="Before discounts" value={money(r.gross)} />
        <Stat label="Member discounts" value={money(r.discounts)} />
        <Stat label="Tabs paid" value={r.orders_paid} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Cash" value={money(method('cash'))} />
        <Stat label="Card" value={money(method('card'))} />
        <Stat label="UPI" value={money(method('upi'))} />
        <Stat label="Voided tabs" value={r.voided_tabs} />
      </div>

      {r.open_tabs.count > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ {r.open_tabs.count} tab(s) worth {money(r.open_tabs.amount)} are still open and unpaid right now.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">Top sellers</h2>
          {r.top_items.length === 0 && <p className="text-sm text-slate-500">No sales on this day.</p>}
          <ul className="divide-y text-sm">
            {r.top_items.map((i) => (
              <li key={i.name} className="flex justify-between py-2"><span>{i.qty} × {i.name}</span><span>{money(i.revenue)}</span></li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">Staff shifts</h2>
          {shifts.length === 0 && <p className="text-sm text-slate-500">No shifts started on this day.</p>}
          <ul className="divide-y text-sm">
            {shifts.map((s) => {
              const diff = s.closing_cash == null ? null : Math.round((s.closing_cash - s.expected_cash) * 100) / 100;
              return (
                <li key={s.id} className="py-2">
                  <div className="flex justify-between">
                    <b>{s.staff_name}</b>
                    <span className="text-slate-500">{s.hours} h {s.ended_at ? '' : '· running'}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    cash {money(s.cash_sales)} · card {money(s.card_sales)} · UPI {money(s.upi_sales)}
                  </p>
                  {diff !== null && (
                    <p className={`text-xs ${diff === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      drawer difference {diff > 0 ? '+' : ''}{money(diff)}{s.note && ` · ${s.note}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
