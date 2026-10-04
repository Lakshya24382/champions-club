import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { addDays, fmtDate, inr, todayStr } from "../lib/format";
import { Card, ErrorBox, PageHeader, Spinner, Stat } from "../components/ui";

const SOURCES = [
  ["courts", "Courts"], ["memberships", "Memberships"], ["shop", "Pro shop"], ["bar", "Bar & cafe"], ["corporate", "Corporate invoices"],
] as const;

// 14 bars, one per day. Plain SVG keeps the bundle small.
function DailyChart({ days }: { days: { date: string; total: number }[] }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  const W = 560, H = 140, bw = W / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full">
      {days.map((d, i) => {
        const h = (d.total / max) * H;
        return (
          <g key={d.date}>
            <rect x={i * bw + 4} y={H - h} width={bw - 8} height={Math.max(h, 1)} rx={3} className="fill-brand-500">
              <title>{`${fmtDate(d.date)}: ${inr(d.total)}`}</title>
            </rect>
            <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle" className="fill-slate-400 text-[9px]">{d.date.slice(8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api("GET", "/finance/dashboard"), refetchInterval: 60_000 });
  const series = useQuery({
    queryKey: ["revenue-series"],
    queryFn: () => api("GET", `/finance/summary${qs({ from: addDays(todayStr(), -13), to: todayStr(), daily: "true" })}`),
  });

  if (dash.isLoading) return <Spinner />;
  if (dash.error) return <ErrorBox error={dash.error} />;
  const d = dash.data;
  const month = d.thisMonth.revenue;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Revenue is earned income; "received" is money recorded by payment method. GST at ${d.taxRatePct}% is estimated.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        {([["Today", d.today], ["This week", d.thisWeek], ["This month", d.thisMonth]] as const).map(([label, p]) => (
          <Stat key={label} label={label} value={inr(p.revenue.total)} sub={`Tax ${inr(p.tax.total)} - Net ${inr(p.netOfTax)}`} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-medium text-slate-900">Revenue, last 14 days</h2>
          {series.data ? <DailyChart days={series.data.daily} /> : <Spinner />}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-slate-900">Received today</h2>
          {(["cash", "card", "upi"] as const).map((m) => (
            <div key={m} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="uppercase text-slate-500">{m}</span><span className="font-medium">{inr(d.today.received[m])}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between text-sm font-semibold"><span>Total</span><span>{inr(d.today.received.total)}</span></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-medium text-slate-900">This month by source</h2>
          <div className="space-y-3">
            {SOURCES.map(([key, label]) => {
              const pct = month.total ? (month[key] / month.total) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-medium">{inr(month[key])}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">Costs this month: {inr(d.thisMonth.costs.total)}</span>
            <span className={d.thisMonth.surplus >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>Surplus {inr(d.thisMonth.surplus)}</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-medium text-slate-900">We owe</h2>
            <Row k={`Salaries (${d.weOwe.payrollPayable.payslips} unpaid)`} v={inr(d.weOwe.payrollPayable.amount)} />
            <Row k={`Bills (${d.weOwe.expensesPayable.bills})`} v={inr(d.weOwe.expensesPayable.amount)} />
            {d.weOwe.expensesPayable.overdue > 0 && <Row k="of which overdue" v={inr(d.weOwe.expensesPayable.overdue)} bad />}
            <Row k="GST this month" v={inr(d.weOwe.gstPayableThisMonth)} />
            <Row k="Total" v={inr(d.weOwe.total)} bold />
          </Card>
          <Card>
            <h2 className="mb-2 font-medium text-slate-900">Owed to us</h2>
            <Row k={`Unpaid invoices (${d.owedToUs.invoicesOutstanding.count})`} v={inr(d.owedToUs.invoicesOutstanding.balance)} />
            {d.owedToUs.invoicesOutstanding.overdueBalance > 0 && <Row k="of which overdue" v={inr(d.owedToUs.invoicesOutstanding.overdueBalance)} bad />}
            <Row k={`Desk payments not recorded (${d.owedToUs.courtAndMembershipPaymentsNotRecorded.count})`} v={inr(d.owedToUs.courtAndMembershipPaymentsNotRecorded.amount)} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v, bad, bold }: { k: string; v: string; bad?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? "mt-1 border-t border-slate-100 pt-2 font-semibold" : ""} ${bad ? "text-red-600" : ""}`}>
      <span className={bold || bad ? "" : "text-slate-500"}>{k}</span><span>{v}</span>
    </div>
  );
}
