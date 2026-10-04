import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, fmtDate, todayStr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Td, Th } from "../components/ui";

const TONE: Record<string, "amber" | "green" | "red" | "slate"> = { pending: "amber", approved: "green", rejected: "red", cancelled: "slate" };

export default function LeavePage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState(isManager ? "pending" : "");
  const [requesting, setRequesting] = useState(false);

  const me = useQuery({ queryKey: ["hr-me"], queryFn: () => api("GET", "/hr/me"), retry: false });
  const list = useQuery({ queryKey: ["leave", status], queryFn: () => api("GET", `/hr/leave${qs({ status })}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["leave"] }); qc.invalidateQueries({ queryKey: ["hr-me"] }); qc.invalidateQueries({ queryKey: ["alerts-count"] }); };

  const decide = useMutation({
    mutationFn: (b: { id: number; decision: string; note?: string }) => api("POST", `/hr/leave/${b.id}/decision`, { decision: b.decision, ...(b.note ? { note: b.note } : {}) }),
    onSuccess: () => { toast.success("Decision saved"); refresh(); },
  });
  const cancel = useMutation({ mutationFn: (id: number) => api("POST", `/hr/leave/${id}/cancel`, {}), onSuccess: () => { toast.success("Leave cancelled"); refresh(); } });
  const bal = me.data?.leave;

  return (
    <>
      <PageHeader title="Leave" subtitle={isManager ? "Approve requests and add leave for staff." : "Request time off and see your balance."} actions={<Button onClick={() => setRequesting(true)}><Plus size={16} /> Request leave</Button>} />

      {bal ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <Stat label={`Paid leave ${bal.year}`} value={`${bal.allowance} days`} />
          <Stat label="Used" value={bal.used} />
          <Stat label="Pending approval" value={bal.pending} />
          <Stat label="Remaining" value={bal.remaining} tone="good" />
        </div>
      ) : !me.isLoading && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {isManager ? "You have no employee record linked to your login, so there is no personal balance to show. You can still manage everyone's leave below." : "No employee record is linked to your login yet. Ask a manager to link it so you can request leave."}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} className={cn("rounded-full px-3 py-1 text-sm", status === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</button>
        ))}
      </div>
      <Card>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.length ? <Empty>No leave requests.</Empty> : (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th right>Days</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {list.data.map((l: any) => {
                const canCancel = ["pending", "approved"].includes(l.status) && !(l.status === "approved" && l.startDate <= todayStr());
                return (
                  <tr key={l.id}>
                    <Td><div className="font-medium">{l.employee}</div><div className="text-xs text-slate-400">{l.code}</div></Td>
                    <Td><Badge tone={l.type === "paid" ? "blue" : "slate"}>{l.type}</Badge></Td>
                    <Td>{fmtDate(l.startDate)}{l.endDate !== l.startDate && ` to ${fmtDate(l.endDate)}`}</Td>
                    <Td right>{l.days}</Td>
                    <Td className="max-w-48 truncate">{l.reason ?? "-"}{l.decisionNote && <div className="text-xs text-slate-400">Manager: {l.decisionNote}</div>}</Td>
                    <Td><Badge tone={TONE[l.status]}>{l.status}</Badge></Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        {isManager && l.status === "pending" && <>
                          <Button size="sm" onClick={() => decide.mutate({ id: l.id, decision: "approve" })}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => { const n = prompt("Reason (optional)") ?? undefined; decide.mutate({ id: l.id, decision: "reject", note: n?.trim() || undefined }); }}>Reject</Button>
                        </>}
                        {canCancel && <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this leave?") && cancel.mutate(l.id)}>Cancel</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {requesting && <RequestModal onClose={() => setRequesting(false)} onDone={refresh} hasOwn={Boolean(me.data)} />}
    </>
  );
}

function RequestModal({ onClose, onDone, hasOwn }: { onClose: () => void; onDone: () => void; hasOwn: boolean }) {
  const { isManager } = useAuth();
  const emps = useQuery({ queryKey: ["employees", false], queryFn: () => api("GET", "/hr/employees?includeInactive=false"), enabled: isManager });
  const [f, setF] = useState({ employeeId: "", type: "paid", startDate: todayStr(), endDate: todayStr(), reason: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const days = f.endDate >= f.startDate ? Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86_400_000) + 1 : 0;
  const send = useMutation({
    mutationFn: () => api("POST", "/hr/leave", {
      type: f.type, startDate: f.startDate, endDate: f.endDate,
      ...(f.employeeId ? { employeeId: Number(f.employeeId) } : {}),
      ...(f.reason.trim() ? { reason: f.reason.trim() } : {}),
    }),
    onSuccess: () => { toast.success("Leave requested"); onDone(); onClose(); },
  });
  return (
    <Modal title="Request leave" onClose={onClose}>
      <div className="space-y-4">
        {isManager && (
          <Field label="For" hint={hasOwn ? "Leave empty to request for yourself." : "You have no employee record, so choose who this is for."}>
            <Select value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}><option value="">{hasOwn ? "Myself" : "Choose an employee"}</option>{emps.data?.map((e: any) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}</Select>
          </Field>
        )}
        <Field label="Type" hint="Paid leave uses the yearly allowance. Beyond that, request unpaid (deducted from salary)."><Select value={f.type} onChange={(e) => set("type", e.target.value)}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
        </div>
        <Field label="Reason (optional)"><Input value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
        <p className="text-sm text-slate-500">{days > 0 ? `${days} day(s) including weekends.` : "End date is before the start date."}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={days <= 0 || (isManager && !hasOwn && !f.employeeId)} loading={send.isPending} onClick={() => send.mutate()}>Submit</Button></div>
      </div>
    </Modal>
  );
}
