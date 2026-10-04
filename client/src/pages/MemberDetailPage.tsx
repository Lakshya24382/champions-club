import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { api, openDocument } from "../lib/api";
import { fmtDate, inr } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";

export default function MemberDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [renewing, setRenewing] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: m, isLoading, error } = useQuery({ queryKey: ["member", id], queryFn: () => api("GET", `/members/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["member", id] });
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["members-expiring"] });
  };

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const active = m.status === "active";

  return (
    <>
      <Link to="/app/members" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Members</Link>
      <PageHeader
        title={m.fullName}
        subtitle={`${m.memberCode} - joined ${fmtDate(m.joinedAt)}`}
        actions={<><Button variant="secondary" onClick={() => setEditing(true)}>Edit contact</Button><Button onClick={() => setRenewing(true)}>Renew / change plan</Button></>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Membership</div>
          <div className="mt-2 flex items-center gap-2"><span className="text-xl font-semibold">{m.plan.name}</span><Badge tone={active ? "green" : "red"}>{m.status}</Badge></div>
          <p className="mt-2 text-sm text-slate-600">{active ? `Expires ${fmtDate(m.expiresAt)} (${m.daysLeft} days left)` : `Expired on ${fmtDate(m.expiresAt)}`}</p>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Benefits</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>Courts: {m.plan.courtDiscountPct === 100 ? "free" : `${m.plan.courtDiscountPct}% off`}</li>
            <li>Shop: {m.plan.shopDiscountPct}% off</li>
            <li>Bar and cafe: {m.plan.barDiscountPct}% off</li>
            <li>Up to {m.plan.maxBookingsPerDay} sessions per day</li>
          </ul>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>{m.phone}</li>
            <li>{m.email ?? "No email on file"}</li>
            <li>Born {fmtDate(m.dateOfBirth)}</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-slate-900">Membership history</h2>
        <Table>
          <thead><tr><Th>Plan</Th><Th>From</Th><Th>To</Th><Th right>Paid</Th><Th /></tr></thead>
          <tbody>
            {m.history.map((h: any) => (
              <tr key={h.id}>
                <Td>{h.plan}</Td><Td>{fmtDate(h.startsAt)}</Td><Td>{fmtDate(h.endsAt)}</Td><Td right>{inr(h.amountPaid)}</Td>
                <Td right><Button size="sm" variant="ghost" onClick={() => openDocument(`/desk/receipts/membership/${h.id}`).catch((e) => toast.error(e.message))}><Printer size={14} /> Receipt</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {renewing && <RenewModal member={m} onClose={() => setRenewing(false)} onDone={refresh} />}
      {editing && <EditModal member={m} onClose={() => setEditing(false)} onDone={refresh} />}
    </>
  );
}

function RenewModal({ member, onClose, onDone }: { member: any; onClose: () => void; onDone: () => void }) {
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("GET", "/plans") });
  const [tier, setTier] = useState(member.plan.tier);
  const [months, setMonths] = useState(1);
  const plan = plans.data?.find((p: any) => p.tier === tier);

  const renew = useMutation({
    mutationFn: () => api("POST", `/members/${member.id}/renew`, { planTier: tier, durationMonths: months }),
    onSuccess: (r) => { toast.success(`Renewed until ${fmtDate(r.expiresAt)}`); onDone(); onClose(); },
  });

  return (
    <Modal title="Renew membership" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Renewing early extends from the current expiry, so no paid days are lost.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan"><Select value={tier} onChange={(e) => setTier(e.target.value)}>{plans.data?.map((p: any) => <option key={p.tier} value={p.tier}>{p.name} - {inr(p.monthlyFee)}/mo</option>)}</Select></Field>
          <Field label="Months"><Input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
        </div>
        {plan && <p className="rounded-lg bg-slate-50 p-3 text-sm">To collect: <b>{inr(plan.monthlyFee * months)}</b></p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={renew.isPending} onClick={() => renew.mutate()}>Confirm renewal</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ member, onClose, onDone }: { member: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fullName: member.fullName, phone: member.phone, email: member.email ?? "" });
  const save = useMutation({
    mutationFn: () => api("PATCH", `/members/${member.id}`, {
      fullName: f.fullName.trim(), phone: f.phone.trim(), ...(f.email.trim() ? { email: f.email.trim() } : {}),
    }),
    onSuccess: () => { toast.success("Contact details updated"); onDone(); onClose(); },
  });
  return (
    <Modal title="Edit contact details" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
      </div>
    </Modal>
  );
}
