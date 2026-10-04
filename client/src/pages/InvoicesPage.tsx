import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { api, openDocument, qs } from "../lib/api";
import { cn, fmtDate, fmtDateTime, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";

const TONE: Record<string, "blue" | "amber" | "green" | "red"> = { issued: "blue", partially_paid: "amber", paid: "green", void: "red" };
const VIEWS = [["", "All"], ["issued", "Unpaid"], ["partially_paid", "Part paid"], ["paid", "Paid"], ["overdue", "Overdue"], ["void", "Void"]] as const;

export default function InvoicesPage() {
  const [view, setView] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["invoices", view, q],
    queryFn: () => api("GET", `/finance/invoices${qs(view === "overdue" ? { overdue: "true", q } : { status: view, q })}`),
  });

  return (
    <>
      <PageHeader title="Invoices" subtitle="Memberships and business clients. GST is added on top of the line items." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> New invoice</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {VIEWS.map(([v, l]) => <button key={v} onClick={() => setView(v)} className={cn("rounded-full px-3 py-1 text-sm", view === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</button>)}
        <Input className="ml-auto w-60" placeholder="Search client or number" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.length ? <Empty>No invoices.</Empty> : (
          <Table>
            <thead><tr><Th>Number</Th><Th>Client</Th><Th>Due</Th><Th right>Total</Th><Th right>Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.data.map((i: any) => (
                <tr key={i.id} onClick={() => setOpenId(i.id)} className="cursor-pointer hover:bg-slate-50">
                  <Td className="font-mono text-xs">{i.invoiceNumber}</Td>
                  <Td><div className="font-medium">{i.clientCompany ?? i.clientName}</div>{i.clientCompany && <div className="text-xs text-slate-400">{i.clientName}</div>}</Td>
                  <Td><span className={i.overdue ? "font-semibold text-red-600" : ""}>{fmtDate(i.dueDate)}{i.overdue && " (overdue)"}</span></Td>
                  <Td right>{inr(i.total)}</Td>
                  <Td right>{i.status === "void" ? "-" : inr(i.balance)}</Td>
                  <Td><Badge tone={TONE[i.status]}>{i.status.replace("_", " ")}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {openId && <InvoiceModal id={openId} onClose={() => setOpenId(null)} />}
      {creating && <NewInvoiceModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </>
  );
}

function InvoiceModal({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const { data: inv, isLoading } = useQuery({ queryKey: ["invoice", id], queryFn: () => api("GET", `/finance/invoices/${id}`) });
  const done = (msg: string) => () => {
    toast.success(msg);
    setAmount(""); setReference("");
    qc.invalidateQueries({ queryKey: ["invoice", id] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const pay = useMutation({
    mutationFn: () => api("POST", `/finance/invoices/${id}/payments`, { amount: Number(amount), method, ...(reference.trim() ? { reference: reference.trim() } : {}) }),
    onSuccess: done("Payment recorded"),
  });
  const voidIt = useMutation({ mutationFn: (reason: string) => api("POST", `/finance/invoices/${id}/void`, { reason }), onSuccess: done("Invoice voided") });
  const payable = inv && ["issued", "partially_paid"].includes(inv.status);

  return (
    <Modal title={inv?.invoiceNumber ?? "Invoice"} onClose={onClose} wide>
      {isLoading || !inv ? <Spinner /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Badge tone={TONE[inv.status]}>{inv.status.replace("_", " ")}</Badge><span className="text-slate-500">Due {fmtDate(inv.dueDate)}</span></div>
            <Button size="sm" variant="secondary" onClick={() => openDocument(`/finance/invoices/${id}/print`).catch((e) => toast.error(e.message))}><Printer size={14} /> Print / PDF</Button>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-medium">{inv.clientCompany ?? inv.clientName}</div>
            {inv.clientCompany && <div>{inv.clientName}</div>}
            <div className="text-slate-500">{[inv.clientEmail, inv.clientPhone].filter(Boolean).join(" | ")}</div>
            {inv.clientGstin && <div className="text-xs text-slate-500">GSTIN {inv.clientGstin}</div>}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {inv.items.map((i: any) => <li key={i.id} className="flex justify-between px-3 py-2"><span>{i.description} ({i.quantity} x {inr(i.unitPrice)})</span><span>{inr(i.lineTotal)}</span></li>)}
          </ul>
          <div className="space-y-1">
            <Row k="Subtotal" v={inr(inv.subtotal)} />
            {inv.discountAmount > 0 && <Row k={`Discount (${inv.discountPct}%)`} v={`-${inr(inv.discountAmount)}`} />}
            <Row k={`GST (${inv.taxRatePct}%)`} v={inr(inv.taxAmount)} />
            <Row k="Total" v={inr(inv.total)} bold />
            <Row k="Paid" v={inr(inv.amountPaid)} />
            <Row k="Balance" v={inr(inv.balance)} bold />
          </div>
          {inv.payments.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Payments</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {inv.payments.map((p: any) => <li key={p.id} className="flex justify-between px-3 py-2"><span>{fmtDateTime(p.paidAt)} - {p.method.toUpperCase()}{p.reference && ` (${p.reference})`}</span><span>{inr(p.amount)}</span></li>)}
              </ul>
            </div>
          )}
          {inv.status === "void" && <p className="text-red-600">Voided: {inv.voidReason}</p>}
          {payable && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="font-medium">Record a payment</h3>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Amount"><Input type="number" min={0} step="0.01" value={amount} placeholder={String(inv.balance)} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option></Select></Field>
                <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." /></Field>
              </div>
              <div className="flex justify-between">
                {inv.status === "issued" ? <Button size="sm" variant="danger" onClick={() => { const r = prompt("Reason for voiding this invoice?"); if (r && r.trim().length >= 3) voidIt.mutate(r.trim()); }}>Void invoice</Button> : <span />}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setAmount(String(inv.balance))}>Full balance</Button>
                  <Button disabled={!(Number(amount) > 0)} loading={pay.isPending} onClick={() => pay.mutate()}>Record payment</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => <div className={cn("flex justify-between", bold ? "font-semibold" : "text-slate-600")}><span>{k}</span><span>{v}</span></div>;

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const [c, setC] = useState({ clientName: "", clientCompany: "", clientEmail: "", clientPhone: "", clientGstin: "", discountPct: 0, dueDays: 15, notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const setItem = (i: number, k: string, v: string | number) => setItems((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = (subtotal * c.discountPct) / 100;

  const create = useMutation({
    mutationFn: () => api("POST", "/finance/invoices", {
      clientName: c.clientName.trim(), discountPct: c.discountPct, dueDays: c.dueDays,
      ...(c.clientCompany.trim() ? { clientCompany: c.clientCompany.trim() } : {}),
      ...(c.clientEmail.trim() ? { clientEmail: c.clientEmail.trim() } : {}),
      ...(c.clientPhone.trim() ? { clientPhone: c.clientPhone.trim() } : {}),
      ...(c.clientGstin.trim() ? { clientGstin: c.clientGstin.trim() } : {}),
      ...(c.notes.trim() ? { notes: c.notes.trim() } : {}),
      items: items.map((i) => ({ description: i.description.trim(), quantity: i.quantity, unitPrice: i.unitPrice })),
    }),
    onSuccess: (inv) => { toast.success(`Invoice ${inv.invoiceNumber} created`); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); onCreated(inv.id); },
  });
  const valid = c.clientName.trim().length >= 2 && items.every((i) => i.description.trim().length >= 2 && i.quantity >= 1 && i.unitPrice > 0);

  return (
    <Modal title="New invoice" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name"><Input value={c.clientName} onChange={(e) => setC({ ...c, clientName: e.target.value })} autoFocus /></Field>
          <Field label="Company (optional)"><Input value={c.clientCompany} onChange={(e) => setC({ ...c, clientCompany: e.target.value })} /></Field>
          <Field label="Email (optional)"><Input type="email" value={c.clientEmail} onChange={(e) => setC({ ...c, clientEmail: e.target.value })} /></Field>
          <Field label="Phone (optional)"><Input value={c.clientPhone} onChange={(e) => setC({ ...c, clientPhone: e.target.value })} /></Field>
          <Field label="GSTIN (optional)"><Input maxLength={15} value={c.clientGstin} onChange={(e) => setC({ ...c, clientGstin: e.target.value.toUpperCase() })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount %"><Input type="number" min={0} max={30} value={c.discountPct} onChange={(e) => setC({ ...c, discountPct: Number(e.target.value) })} /></Field>
            <Field label="Due in (days)"><Input type="number" min={1} max={90} value={c.dueDays} onChange={(e) => setC({ ...c, dueDays: Number(e.target.value) })} /></Field>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">Line items</h3><Button size="sm" variant="secondary" onClick={() => setItems((a) => [...a, { description: "", quantity: 1, unitPrice: 0 }])}><Plus size={12} /> Add line</Button></div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Description" value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} />
                <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, "quantity", Number(e.target.value))} />
                <Input className="col-span-3" type="number" min={0} placeholder="Unit price" value={it.unitPrice} onChange={(e) => setItem(i, "unitPrice", Number(e.target.value))} />
                <Button size="sm" variant="ghost" className="col-span-1" disabled={items.length === 1} onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
              </div>
            ))}
          </div>
        </div>
        <Field label="Notes (optional)"><Input value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></Field>
        <p className="rounded-lg bg-slate-50 p-3 text-sm">Subtotal {inr(subtotal)}{c.discountPct > 0 && ` - discount ${inr(discount)}`}. GST is added when you create the invoice.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>Create invoice</Button></div>
      </div>
    </Modal>
  );
}
