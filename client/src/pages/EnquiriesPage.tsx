import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn, fmtDate } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pager, Select, Spinner, Stat, Table, Td, Textarea, Th } from "../components/ui";

export const STATUS_TONE: Record<string, "amber" | "blue" | "purple" | "green" | "red"> = { new: "amber", contacted: "blue", quote_sent: "purple", won: "green", lost: "red" };
export const statusLabel = (s: string) => s.replace("_", " ");

const VIEWS = [
  ["", "All"], ["new", "New"], ["contacted", "Contacted"], ["quote_sent", "Quote sent"], ["won", "Won"], ["lost", "Lost"],
  ["due", "Follow-up due"], ["me", "Mine"], ["unassigned", "Unassigned"],
] as const;

function paramsFor(view: string) {
  if (["new", "contacted", "quote_sent", "won", "lost"].includes(view)) return { status: view };
  if (view === "due") return { due: "true" };
  if (view === "me") return { assigned: "me" };
  if (view === "unassigned") return { assigned: "unassigned" };
  return {};
}

export default function EnquiriesPage() {
  const nav = useNavigate();
  const [view, setView] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const summary = useQuery({ queryKey: ["enq-summary"], queryFn: () => api("GET", "/enquiries/summary"), refetchInterval: 60_000 });
  const list = useQuery({
    queryKey: ["enquiries", view, type, search, page],
    queryFn: () => api("GET", `/enquiries${qs({ ...paramsFor(view), type, q: search, page, limit: 15 })}`),
    placeholderData: (prev) => prev,
  });
  const s = summary.data;

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Website enquiries, calls and walk-ins. Follow up, quote, and welcome new members." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> Log enquiry</Button>} />

      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="New" value={s.byStatus.new ?? 0} />
          <Stat label="Follow-ups overdue" value={s.followUpsOverdue} tone={s.followUpsOverdue > 0 ? "bad" : undefined} />
          <Stat label="Unassigned (open)" value={s.unassignedOpen} />
          <Stat label="New this week" value={s.newThisWeek} />
          <Stat label="Conversion, 30 days" value={s.last30Days.conversionRate == null ? "-" : `${s.last30Days.conversionRate}%`} sub={`${s.last30Days.won} won, ${s.last30Days.lost} lost`} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); setPage(1); }} className={cn("rounded-full px-3 py-1 text-sm", view === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{label}</button>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <Input className="pl-9" placeholder="Search name, phone, reference or company" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option><option value="membership">Membership</option><option value="trial">Trial</option><option value="corporate">Corporate</option><option value="general">General</option>
          </Select>
        </div>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.data.length ? <Empty>No enquiries here.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>Ref</Th><Th>Who</Th><Th>Type</Th><Th>Status</Th><Th>Owner</Th><Th>Follow up</Th></tr></thead>
              <tbody>
                {list.data.data.map((e: any) => (
                  <tr key={e.id} onClick={() => nav(`/app/enquiries/${e.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <Td className="font-mono text-xs">{e.ref}</Td>
                    <Td><div className="font-medium">{e.name}</div><div className="text-xs text-slate-400">{e.companyName ?? e.phone}</div></Td>
                    <Td><Badge tone="slate">{e.type}</Badge> <span className="text-xs text-slate-400">{e.source.replace("_", " ")}</span></Td>
                    <Td><Badge tone={STATUS_TONE[e.status]}>{statusLabel(e.status)}</Badge></Td>
                    <Td>{e.assignee ?? <span className="text-slate-400">unassigned</span>}</Td>
                    <Td>{e.followUpAt ? <span className={e.followUpOverdue ? "font-semibold text-red-600" : ""}>{fmtDate(e.followUpAt)}{e.followUpOverdue && " (overdue)"}</span> : "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {creating && <NewEnquiryModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewEnquiryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [f, setF] = useState({ source: "phone", name: "", phone: "", email: "", type: "general", companyName: "", interestedPlan: "", message: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const create = useMutation({
    mutationFn: () => api("POST", "/enquiries", {
      source: f.source, name: f.name.trim(), phone: f.phone.trim(), type: f.type,
      ...(f.email.trim() ? { email: f.email.trim() } : {}),
      ...(f.type === "corporate" ? { companyName: f.companyName.trim() } : {}),
      ...(f.interestedPlan ? { interestedPlan: f.interestedPlan } : {}),
      ...(f.message.trim() ? { message: f.message.trim() } : {}),
    }),
    onSuccess: (e) => {
      toast.success(e.duplicate ? `Already open as ${e.ref}: added as a note` : `Enquiry ${e.ref} logged`);
      qc.invalidateQueries({ queryKey: ["enquiries"] });
      qc.invalidateQueries({ queryKey: ["enq-summary"] });
      onClose();
      nav(`/app/enquiries/${e.id}`);
    },
  });
  return (
    <Modal title="Log an enquiry" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Came in by"><Select value={f.source} onChange={(e) => set("source", e.target.value)}><option value="phone">Phone call</option><option value="walk_in">Walk-in</option></Select></Field>
          <Field label="About"><Select value={f.type} onChange={(e) => set("type", e.target.value)}><option value="general">General</option><option value="membership">Membership</option><option value="corporate">Corporate</option></Select></Field>
          <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9876543210" /></Field>
        </div>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        {f.type === "corporate" && <Field label="Company"><Input value={f.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>}
        <Field label="Interested in (optional)"><Select value={f.interestedPlan} onChange={(e) => set("interestedPlan", e.target.value)}><option value="">Not sure</option><option value="gold">Gold</option><option value="silver">Silver</option><option value="junior">Junior</option></Select></Field>
        <Field label="What did they ask?"><Textarea rows={3} value={f.message} onChange={(e) => set("message", e.target.value)} /></Field>
        <p className="text-xs text-slate-400">If this phone number already has an open enquiry, this is added to it instead of creating a duplicate.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={f.name.trim().length < 2 || f.phone.trim().length < 10 || (f.type === "corporate" && f.companyName.trim().length < 2)} loading={create.isPending} onClick={() => create.mutate()}>Save enquiry</Button></div>
      </div>
    </Modal>
  );
}
