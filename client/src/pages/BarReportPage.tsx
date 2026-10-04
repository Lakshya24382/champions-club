import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { fmtTime, inr, todayStr } from "../lib/format";
import { Badge, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Stat, Table, Td, Th } from "../components/ui";

export default function BarReportPage() {
  const [date, setDate] = useState(todayStr());
  const r = useQuery({ queryKey: ["bar-report", date], queryFn: () => api("GET", `/bar/reports/daily${qs({ date })}`) });

  return (
    <>
      <PageHeader title="Bar closing report" subtitle="What the bar earned on the day, by payment method, category and shift." actions={<Input type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />} />
      {r.isLoading ? <Spinner /> : r.error ? <ErrorBox error={r.error} /> : (() => {
        const d = r.data;
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Paid tabs" value={d.sales.paidTabs} />
              <Stat label="Gross sales" value={inr(d.sales.gross)} />
              <Stat label="Discounts given" value={inr(d.sales.discounts)} />
              <Stat label="Net takings" value={inr(d.sales.net)} tone="good" />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card>
                <h2 className="mb-2 font-medium text-slate-900">By payment method</h2>
                {["cash", "card", "upi"].map((m) => <div key={m} className="flex justify-between py-1 text-sm"><span className="uppercase text-slate-500">{m}</span><span>{inr(d.byPaymentMethod[m] ?? 0)}</span></div>)}
              </Card>
              <Card>
                <h2 className="mb-2 font-medium text-slate-900">By category (before discount)</h2>
                {Object.keys(d.byCategory).length === 0 ? <p className="text-sm text-slate-400">No sales.</p> : Object.entries(d.byCategory).map(([c, v]: any) => <div key={c} className="flex justify-between py-1 text-sm"><span className="capitalize text-slate-500">{c}</span><span>{inr(v)}</span></div>)}
              </Card>
              <Card>
                <h2 className="mb-2 font-medium text-slate-900">Top items</h2>
                {!d.topItems.length ? <p className="text-sm text-slate-400">No sales.</p> : d.topItems.map((t: any) => <div key={t.item} className="flex justify-between py-1 text-sm"><span>{t.item}</span><span className="text-slate-500">{t.quantity} sold</span></div>)}
              </Card>
            </div>

            {d.stillOpen.tabs > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {d.stillOpen.tabs} tab(s) are still open ({inr(d.stillOpen.amountBeforeDiscount)} before discount). They count once they are paid.
              </div>
            )}

            <Card className="mt-6">
              <h2 className="mb-3 font-medium text-slate-900">Shifts</h2>
              {!d.shifts.length ? <Empty>No shifts on this day.</Empty> : (
                <Table>
                  <thead><tr><Th>Staff</Th><Th>Time</Th><Th right>Opening</Th><Th right>Cash sales</Th><Th right>Expected</Th><Th right>Counted</Th><Th right>Variance</Th></tr></thead>
                  <tbody>
                    {d.shifts.map((s: any, i: number) => (
                      <tr key={i}>
                        <Td className="font-medium">{s.staff}</Td>
                        <Td>{fmtTime(s.startedAt)} - {s.endedAt ? fmtTime(s.endedAt) : <Badge tone="green">open</Badge>}</Td>
                        <Td right>{inr(s.openingCash)}</Td>
                        <Td right>{inr(s.takings.cash ?? 0)}</Td>
                        <Td right>{s.expectedCash == null ? "-" : inr(s.expectedCash)}</Td>
                        <Td right>{s.closingCash == null ? "-" : inr(s.closingCash)}</Td>
                        <Td right>{s.variance == null ? "-" : <span className={s.variance === 0 ? "text-emerald-600" : "font-semibold text-red-600"}>{s.variance === 0 ? "OK" : inr(s.variance)}</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        );
      })()}
    </>
  );
}
