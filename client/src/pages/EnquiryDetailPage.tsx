import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ageOf, fmtDate, fmtDateTime, inr, toIso } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from "../components/ui";
import { STATUS_TONE, statusLabel } from "./EnquiriesPage";

const NOTE_TONE: Record<string, "slate" | "blue" | "purple" | "amber"> = { note: "blue", status_change: "purple", assignment: "amber", system: "slate" };

export default function EnquiryDetailPage() {
  const { id } = useParams();
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [quoting, setQuoting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [invoicing, setInvoicing] = useState<any>(null);
  const [body, setBody] = useState("");
  const [contacted, setContacted] = useState(true);
  const [followUp, setFollowUp] = useState("");

  const { data: e, isLoading, error } = useQuery({ queryKey: ["enquiry", id], queryFn: () => api("GET", `/enquiries/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["enquiry", id] });
    qc.invalidateQueries({ queryKey: ["enquiries"] });
    qc.invalidateQueries({ queryKey: ["enq-summary"] });
  };

  const assign = useMutation({ mutationFn: () => api("POST", `/enquiries/${id}/assign`, {}), onSuccess: () => { toast.success("Assigned to you"); refresh(); } });
  const note = useMutation({
    mutationFn: () => api("POST", `/enquiries/${id}/notes`, { body: body.trim(), contacted, ...(followUp ? { followUpAt: toIso(followUp, "11:00") } : {}) }),
    onSuccess: () => { toast.success("Note saved"); setBody(""); setFollowUp(""); refresh(); },
  });
  const setStatus = useMutation({
    mutationFn: (b: { status: string; lostReason?: string }) => api("POST", `/enquiries/${id}/status`, b),
    onSuccess: () => { toast.success("Status updated"); refresh(); },
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const closed = ["won", "lost"].includes(e.status);
  const mine = e.assignedTo === user!.id;
  const canConvert = !e.memberId && e.type !== "corporate" && e.status !== "lost";
  const overdue = e.followUpAt && !closed && new Date(e.followUpAt) <= new Date();

  return (
    <>
      <Link to="/app/enquiries" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Enquiries</Link>
      <PageHeader
        title={e.name}
        subtitle={`${e.ref} - ${e.type} - via ${e.source.replace("_", " ")}`}
        actions={<>
          {!mine && <Button variant="secondary" loading={assign.isPending} onClick={() => assign.mutate()}>Assign to me</Button>}
          {!closed && <Button variant="secondary" onClick={() => setQuoting(true)}>Send quote</Button>}
          {canConvert && <Button onClick={() => setConverting(true)}>Convert to member</Button>}
        </>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</div>
          <div className="mt-2 flex items-center gap-2"><Badge tone={STATUS_TONE[e.status]}>{statusLabel(e.status)}</Badge>{e.memberCode && <span className="font-mono text-xs text-slate-500">{e.memberCode}</span>}</div>
          <p className="mt-2 text-sm text-slate-600">Owner: {e.assignee ?? "unassigned"}</p>
          {e.followUpAt && <p className={`text-sm ${overdue ? "font-semibold text-red-600" : "text-slate-600"}`}>Follow up: {fmtDate(e.followUpAt)}{overdue && " (overdue)"}</p>}
          {e.lostReason && <p className="text-sm text-red-600">Lost: {e.lostReason}</p>}
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>{e.phone}</li><li>{e.email ?? "No email"}</li>{e.companyName && <li>{e.companyName}</li>}
          </ul>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Interest</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>Plan: {e.interestedPlan ?? "not stated"}</li><li>Sport: {e.sport ?? "not stated"}</li>
            {e.message && <li className="pt-1 italic">"{e.message}"</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!closed && (
            <Card>
              <h2 className="mb-3 font-medium text-slate-900">Log a call or note</h2>
              <Textarea rows={3} value={body} onChange={(ev) => setBody(ev.target.value)} placeholder="Spoke to them, wants a trial next week..." />
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={contacted} onChange={(ev) => setContacted(ev.target.checked)} /> We spoke to them</label>
                <Field label="Next follow-up"><Input type="date" className="w-44" value={followUp} onChange={(ev) => setFollowUp(ev.target.value)} /></Field>
                <Button className="ml-auto" disabled={body.trim().length < 2} loading={note.isPending} onClick={() => note.mutate()}>Save note</Button>
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-medium text-slate-900">Timeline</h2>
            <ul className="space-y-3">
              {e.notes.map((n: any) => (
                <li key={n.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <div className="flex items-center gap-2"><Badge tone={NOTE_TONE[n.kind]}>{n.kind.replace("_", " ")}</Badge><span className="text-xs text-slate-400">{fmtDateTime(n.createdAt)} - {n.author ?? "system / website"}</span></div>
                  <p className="mt-1 whitespace-pre-line text-slate-700">{n.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-medium text-slate-900">Quotes</h2>
            {!e.quotes.length ? <p className="text-sm text-slate-400">No quotes sent yet.</p> : e.quotes.map((q: any) => (
              <div key={q.id} className="mb-3 rounded-lg border border-slate-200 p-3 text-sm last:mb-0">
                <div className="flex justify-between"><b>{q.quoteNumber}</b>{q.expired ? <Badge tone="red">expired</Badge> : <Badge tone="green">valid</Badge>}</div>
                <div className="text-slate-600">{q.plan} x {q.memberCount} for {q.durationMonths} month(s)</div>
                <div className="text-slate-600">{q.discountPct > 0 && `${q.discountPct}% off - `}Total <b>{inr(q.total)}</b></div>
                <div className="text-xs text-slate-400">Valid until {fmtDate(q.validUntil)}</div>
                {isManager && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setInvoicing(q)}>Create invoice</Button>}
              </div>
            ))}
          </Card>

          <Card>
            <h2 className="mb-3 font-medium text-slate-900">Close out</h2>
            <div className="space-y-2">
              {!closed && e.type === "corporate" && isManager && <Button className="w-full" variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: "won" })}>Mark won (corporate deal agreed)</Button>}
              {!closed && e.type === "corporate" && !isManager && <p className="text-xs text-slate-400">A manager marks corporate deals won once agreed.</p>}
              {!closed && <Button className="w-full" variant="danger" onClick={() => { const r = prompt("Why was this enquiry lost?"); if (r && r.trim().length >= 3) setStatus.mutate({ status: "lost", lostReason: r.trim() }); }}>Mark lost</Button>}
              {closed && isManager && <Button className="w-full" variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: "new" })}>Reopen</Button>}
              {closed && !isManager && <p className="text-xs text-slate-400">Only a manager can reopen a closed enquiry.</p>}
            </div>
          </Card>
        </div>
      </div>

      {quoting && <QuoteModal id={e.id} defaultPlan={e.interestedPlan} onClose={() => setQuoting(false)} onDone={refresh} />}
      {converting && <ConvertModal id={e.id} defaultPlan={e.interestedPlan} onClose={() => setConverting(false)} onDone={refresh} />}
      {invoicing && <InvoiceFromQuoteModal quote={invoicing} onClose={() => setInvoicing(null)} onDone={refresh} />}
    </>
  );
}

function QuoteModal({ id, defaultPlan, onClose, onDone }: { id: number; defaultPlan: string | null; onClose: () => void; onDone: () => void }) {
  const { isManager } = useAuth();
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("GET", "/plans") });
  const [f, setF] = useState({ planTier: defaultPlan ?? "gold", durationMonths: 3, memberCount: 1, discountPct: 0, validDays: 14, note: "" });
  const maxDisc = isManager ? 30 : 10;
  const plan = plans.data?.find((p: any) => p.tier === f.planTier);
  const subtotal = plan ? plan.monthlyFee * f.durationMonths * f.memberCount : 0;
  const total = subtotal - (subtotal * f.discountPct) / 100;
  const send = useMutation({
    mutationFn: () => api("POST", `/enquiries/${id}/quotes`, { ...f, ...(f.note.trim() ? { note: f.note.trim() } : { note: undefined }) }),
    onSuccess: (q) => { toast.success(`Quote ${q.quoteNumber} sent`); onDone(); onClose(); },
  });
  const n = (k: string) => (ev: any) => setF({ ...f, [k]: Number(ev.target.value) });
  return (
    <Modal title="Send a quote" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan"><Select value={f.planTier} onChange={(ev) => setF({ ...f, planTier: ev.target.value })}>{plans.data?.map((p: any) => <option key={p.tier} value={p.tier}>{p.name} - {inr(p.monthlyFee)}/mo</option>)}</Select></Field>
          <Field label="Months"><Input type="number" min={1} max={24} value={f.durationMonths} onChange={n("durationMonths")} /></Field>
          <Field label="Members"><Input type="number" min={1} max={200} value={f.memberCount} onChange={n("memberCount")} /></Field>
          <Field label={`Discount % (max ${maxDisc})`}><Input type="number" min={0} max={maxDisc} value={f.discountPct} onChange={n("discountPct")} /></Field>
          <Field label="Valid for (days)"><Input type="number" min={1} max={60} value={f.validDays} onChange={n("validDays")} /></Field>
        </div>
        <Field label="Note to customer (optional)"><Input value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} /></Field>
        <p className="rounded-lg bg-slate-50 p-3 text-sm">Subtotal {inr(subtotal)} - Total <b>{inr(total)}</b></p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={send.isPending} onClick={() => send.mutate()}>Send quote</Button></div>
      </div>
    </Modal>
  );
}

function ConvertModal({ id, defaultPlan, onClose, onDone }: { id: number; defaultPlan: string | null; onClose: () => void; onDone: () => void }) {
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("GET", "/plans") });
  const [f, setF] = useState({ planTier: defaultPlan ?? "silver", durationMonths: 1, dateOfBirth: "" });
  const minor = f.dateOfBirth ? ageOf(f.dateOfBirth) < 18 : null;
  const onDob = (dob: string) => setF((s) => ({ ...s, dateOfBirth: dob, planTier: dob ? (ageOf(dob) < 18 ? "junior" : s.planTier === "junior" ? "silver" : s.planTier) : s.planTier }));
  const plan = plans.data?.find((p: any) => p.tier === f.planTier);
  const convert = useMutation({
    mutationFn: () => api("POST", `/enquiries/${id}/convert`, f),
    onSuccess: (m) => { toast.success(`Welcome ${m.fullName}! Member code ${m.memberCode}`); onDone(); onClose(); },
  });
  return (
    <Modal title="Convert to member" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Creates the member from this enquiry's contact details and marks the enquiry won.</p>
        <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(ev) => onDob(ev.target.value)} max={new Date().toISOString().slice(0, 10)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan" hint={minor === true ? "Under 18: Junior only" : minor === false ? "Adults: Gold or Silver" : undefined}>
            <Select value={f.planTier} onChange={(ev) => setF({ ...f, planTier: ev.target.value })}>
              {plans.data?.map((p: any) => <option key={p.tier} value={p.tier} disabled={minor !== null && (p.tier === "junior") !== minor}>{p.name} - {inr(p.monthlyFee)}/mo</option>)}
            </Select>
          </Field>
          <Field label="Months"><Input type="number" min={1} max={24} value={f.durationMonths} onChange={(ev) => setF({ ...f, durationMonths: Number(ev.target.value) })} /></Field>
        </div>
        {plan && <p className="rounded-lg bg-slate-50 p-3 text-sm">To collect: <b>{inr(plan.monthlyFee * f.durationMonths)}</b></p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!f.dateOfBirth} loading={convert.isPending} onClick={() => convert.mutate()}>Create member</Button></div>
      </div>
    </Modal>
  );
}

function InvoiceFromQuoteModal({ quote, onClose, onDone }: { quote: any; onClose: () => void; onDone: () => void }) {
  const [dueDays, setDueDays] = useState(15);
  const [gstin, setGstin] = useState("");
  const create = useMutation({
    mutationFn: () => api("POST", `/finance/invoices/from-quote/${quote.id}`, { dueDays, ...(gstin.trim() ? { clientGstin: gstin.trim() } : {}) }),
    onSuccess: (inv) => { toast.success(`Invoice ${inv.invoiceNumber} created (${inr(inv.total)} with GST)`); onDone(); onClose(); },
  });
  return (
    <Modal title={`Invoice from ${quote.quoteNumber}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Quote total {inr(quote.total)}. GST is added on top by the server.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due in (days)"><Input type="number" min={1} max={90} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} /></Field>
          <Field label="Client GSTIN (optional)"><Input value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Create invoice</Button></div>
      </div>
    </Modal>
  );
}
