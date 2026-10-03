import { Link } from 'react-router';
import { money } from './ui.jsx';

const METHODS = [['cash', 'Cash'], ['card', 'Card'], ['upi', 'UPI / online'], ['unrecorded', 'Not recorded']];
const SOURCE_COLORS = {
  courts: 'bg-emerald-500', membership: 'bg-violet-500', shop: 'bg-sky-500', bar: 'bg-amber-500', invoices: 'bg-rose-500',
};

function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// internal = true on the staff page (shows links to fix things); false on the public shared page.
export default function ReportView({ r, internal = false }) {
  const maxDay = Math.max(1, ...r.daily.map((d) => d.total));
  const change = r.previous.change_pct;
  const unrec = r.totals.by_method.unrecorded;
  const costs = r.expenses.net + r.payroll.cost;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Revenue (incl. GST)" value={money(r.totals.gross)}
              sub={change == null ? 'No earlier data to compare'
                : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs previous ${r.days} day(s) (${money(r.previous.gross)})`}
              tone="border-emerald-300" />
        <Stat label="Revenue (excl. GST)" value={money(r.totals.net)} sub={`GST inside: ${money(r.totals.tax)}`} />
        <Stat label="Costs" value={money(costs)} sub={`Bills ${money(r.expenses.net)} · payroll ${money(r.payroll.cost)}`} />
        <Stat label="Estimated profit" value={money(r.profit)} tone={r.profit < 0 ? 'border-red-300' : ''}
              sub="Revenue excl. GST minus costs" />
      </div>

      {unrec > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {money(unrec)} of revenue has no payment method recorded (court and membership payments).
          {internal && <> <Link className="underline" to="/collections">Tag them in Collections</Link> to see a true cash / card / UPI split.</>}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Where it came from</th><th className="p-3 text-right">Sales</th>
              <th className="p-3 text-right">Revenue</th><th className="p-3 text-right">GST</th>
              {METHODS.map(([k, l]) => <th key={k} className="p-3 text-right">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.sources.map((s) => (
              <tr key={s.key} className="border-t">
                <td className="p-3 font-medium"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${SOURCE_COLORS[s.key]}`} />{s.label}</td>
                <td className="p-3 text-right">{s.count}</td>
                <td className="p-3 text-right font-semibold">{money(s.gross)}</td>
                <td className="p-3 text-right text-slate-500">{money(s.tax)}</td>
                {METHODS.map(([k]) => <td key={k} className="p-3 text-right">{money(s.by_method[k])}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 bg-slate-50 font-bold">
              <td className="p-3">Total</td><td className="p-3" />
              <td className="p-3 text-right">{money(r.totals.gross)}</td>
              <td className="p-3 text-right">{money(r.totals.tax)}</td>
              {METHODS.map(([k]) => <td key={k} className="p-3 text-right">{money(r.totals.by_method[k])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Revenue by day</h2>
        <div className="flex h-36 items-end gap-px">
          {r.daily.map((d) => (
            <div key={d.day} className="flex h-full min-w-[2px] flex-1 flex-col justify-end"
                 title={`${d.day}: ${money(d.total)}`}>
              {Object.keys(SOURCE_COLORS).map((k) => d[k] > 0 && (
                <div key={k} className={SOURCE_COLORS[k]} style={{ height: `${(d[k] / maxDay) * 100}%` }} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{r.from}</span><span>{r.to}</span></div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">What we owe</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Unpaid bills</dt><dd>{money(r.owed.bills_unpaid)}</dd></div>
            <div className="flex justify-between text-red-600"><dt>…of which overdue</dt><dd>{money(r.owed.bills_overdue)}</dd></div>
            <div className="flex justify-between"><dt>Payroll not yet paid</dt><dd>{money(r.owed.payroll_unpaid)}</dd></div>
            <div className="flex justify-between"><dt>GST payable (this period, est.)</dt><dd>{money(Math.max(r.tax.payable, 0))}</dd></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-emerald-700"><dt>Clients owe us</dt><dd>{money(r.owed.invoices_receivable)}</dd></div>
            <div className="flex justify-between text-xs text-red-600"><dt>…overdue</dt><dd>{money(r.owed.invoices_overdue)}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">GST summary</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Collected on sales</dt><dd>{money(r.tax.output)}</dd></div>
            <div className="flex justify-between"><dt>Paid on bills (input)</dt><dd>−{money(r.tax.input)}</dd></div>
            <div className="flex justify-between border-t pt-1 font-bold"><dt>Estimated payable</dt><dd>{money(r.tax.payable)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            Rates: courts {r.tax.rates.courts}% · memberships {r.tax.rates.membership}% · shop {r.tax.rates.shop}% · bar {r.tax.rates.bar}%.
            An estimate for planning, not a GST return.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">Bills by category</h2>
          {r.expenses.rows.length === 0 && <p className="text-sm text-slate-500">No bills in this period.</p>}
          <ul className="space-y-1 text-sm">
            {r.expenses.rows.map((e) => (
              <li key={e.category} className="flex justify-between"><span className="capitalize">{e.category}</span><span>{money(e.total)}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
