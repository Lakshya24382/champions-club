import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn, fmtDate, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";

const CATS = ["rent", "utilities", "supplies", "maintenance", "marketing", "other"];

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<any>(null);

  const list = useQuery({ queryKey: ["expenses", status, category], queryFn: () => api("GET", `/finance/expenses${qs({ status, category })}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const unpaid = (list.data ?? []).filter((e: any) => !e.paidAt);

  return (
    <>
      <PageHeader title="Expenses" subtitle="Bills the club owes and has paid. Unpaid bills show up under 'We owe' on the dashboard." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> Add expense</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[["", "All"], ["unpaid", "Unpaid"], ["paid", "Paid"]].map(([v, l]) => <button key={v} onClick={() => setStatus(v)} className={cn("rounded-full px-3 py-1 text-sm", status === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</button>)}
        <Select className="ml-auto w-44" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>
      <Card>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.length ? <Empty>No expenses.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Due</Th><Th right>Amount</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {list.data.map((e: any) => (
                  <tr key={e.id}>
                    <Td>{fmtDate(e.incurredOn)}</Td>
                    <Td className="capitalize">{e.category}</Td>
                    <Td><div className="font-medium">{e.description}</div>{e.payee && <div className="text-xs text-slate-400">{e.payee}</div>}</Td>
                    <Td>{e.dueDate ? <span className={e.overdue ? "font-semibold text-red-600" : ""}>{fmtDate(e.dueDate)}{e.overdue && " (overdue)"}</span> : "-"}</Td>
                    <Td right>{inr(e.amount)}</Td>
                    <Td>{e.paidAt ? <Badge tone="green">paid {e.paidMethod}</Badge> : <Badge tone="amber">unpaid</Badge>}</Td>
                    <Td right>{!e.paidAt && <Button size="sm" variant="secondary" onClick={() => setPaying(e)}>Mark paid</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {unpaid.length > 0 && <p className="mt-3 text-right text-sm text-slate-500">Unpaid in this list: <b>{inr(unpaid.reduce((s: number, e: any) => s + e.amount, 0))}</b></p>}
          </>
        )}
      </Card>
      {creating && <NewExpenseModal onClose={() => setCreating(false)} onDone={refresh} />}
      {paying && <PayModal expense={paying} onClose={() => setPaying(null)} onDone={refresh} />}
    </>
  );
}

function PayModal({ expense, onClose, onDone }: { expense: any; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState("upi");
  const pay = useMutation({ mutationFn: () => api("POST", `/finance/expenses/${expense.id}/pay`, { method }), onSuccess: () => { toast.success("Marked paid"); onDone(); onClose(); } });
  return (
    <Modal title="Mark as paid" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{expense.description}: <b>{inr(expense.amount)}</b></p>
        <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option></Select></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={pay.isPending} onClick={() => pay.mutate()}>Confirm</Button></div>
      </div>
    </Modal>
  );
}

function NewExpenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: "utilities", description: "", payee: "", amount: 0, incurredOn: "", dueDate: "", paidNow: "" });
  const set = (k: string, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  const create = useMutation({
    mutationFn: () => api("POST", "/finance/expenses", {
      category: f.category, description: f.description.trim(), amount: f.amount,
      ...(f.payee.trim() ? { payee: f.payee.trim() } : {}),
      ...(f.incurredOn ? { incurredOn: f.incurredOn } : {}),
      ...(f.dueDate ? { dueDate: f.dueDate } : {}),
      ...(f.paidNow ? { paidNow: f.paidNow } : {}),
    }),
    onSuccess: () => { toast.success("Expense added"); onDone(); onClose(); },
  });
  return (
    <Modal title="Add expense" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={f.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Amount (INR)"><Input type="number" min={0} value={f.amount} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
        </div>
        <Field label="Description"><Input value={f.description} onChange={(e) => set("description", e.target.value)} autoFocus /></Field>
        <Field label="Payee (optional)"><Input value={f.payee} onChange={(e) => set("payee", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Incurred on (default today)"><Input type="date" value={f.incurredOn} onChange={(e) => set("incurredOn", e.target.value)} /></Field>
          <Field label="Due date (optional)"><Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
        </div>
        <Field label="Already paid?"><Select value={f.paidNow} onChange={(e) => set("paidNow", e.target.value)}><option value="">No, still to pay</option><option value="cash">Yes, by cash</option><option value="card">Yes, by card</option><option value="upi">Yes, by UPI</option></Select></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={f.description.trim().length < 2 || f.amount <= 0} loading={create.isPending} onClick={() => create.mutate()}>Add</Button></div>
      </div>
    </Modal>
  );
}
