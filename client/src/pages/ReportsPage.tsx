import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import { addDays, inr, todayStr } from "../lib/format";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Table, Td, Th } from "../components/ui";

const LABEL: Record<string, string> = { courts: "Courts", memberships: "Memberships", shop: "Pro shop", bar: "Bar and cafe", corporate: "Corporate invoices" };

export default function ReportsPage() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [from, setFrom] = useState(addDays(todayStr(), -29));
  const [to, setTo] = useState(todayStr());
  const tax = useQuery({ queryKey: ["tax", month], queryFn: () => api("GET", `/finance/reports/tax?month=${month}`), enabled: /^\d{4}-\d{2}$/.test(month) });

  return (
    <>
      <PageHeader title="Reports" subtitle="Tax summary for filing and a CSV of daily revenue to share." />
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-medium text-slate-900">Tax collected</h2>
          <Field label="Month"><Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        </div>
        {tax.isLoading ? <Spinner /> : tax.error ? <ErrorBox error={tax.error} /> : (
          <>
            <Table>
              <thead><tr><Th>Source</Th><Th right>Gross (incl. GST)</Th><Th right>Taxable value</Th><Th right>GST ({tax.data.ratePct}%)</Th></tr></thead>
              <tbody>
                {tax.data.bySource.map((r: any) => <tr key={r.source}><Td>{LABEL[r.source]}</Td><Td right>{inr(r.gross)}</Td><Td right>{inr(r.taxable)}</Td><Td right>{inr(r.tax)}</Td></tr>)}
                <tr className="font-semibold"><Td>Total</Td><Td right>{inr(tax.data.total.gross)}</Td><Td right>{inr(tax.data.total.taxable)}</Td><Td right>{inr(tax.data.total.tax)}</Td></tr>
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-slate-400">{tax.data.note}</p>
          </>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-slate-900">Export daily revenue (CSV)</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button disabled={!from || !to || to < from} onClick={() => downloadFile(`/finance/reports/export?from=${from}&to=${to}`, `revenue_${from}_${to}.csv`).catch((e) => toast.error(e.message))}><Download size={16} /> Download CSV</Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">One row per day with revenue by source, tax and net. Up to 366 days.</p>
      </Card>
    </>
  );
}
