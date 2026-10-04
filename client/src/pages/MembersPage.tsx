import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { ageOf, fmtDate, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pager, Select, Spinner, Table, Td, Th } from "../components/ui";

const PLAN_TONE: Record<string, "amber" | "slate" | "blue"> = { gold: "amber", silver: "slate", junior: "blue" };

export default function MembersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  // Wait 350 ms after typing stops before searching
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["members", search, status, page],
    queryFn: () => api("GET", `/members${qs({ q: search, status, page, limit: 15 })}`),
    placeholderData: (prev) => prev, // keep old rows visible while the next page loads
  });
  const expiring = useQuery({ queryKey: ["members-expiring"], queryFn: () => api("GET", "/members/expiring?days=7") });

  return (
    <>
      <PageHeader title="Members" subtitle="Registry, plans and expiry tracking" actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> New member</Button>} />

      {expiring.data?.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 text-sm font-medium text-amber-800">{expiring.data.length} membership(s) expiring within 7 days</div>
          <div className="flex flex-wrap gap-2">
            {expiring.data.slice(0, 8).map((m: any) => (
              <button key={m.id} onClick={() => nav(`/app/members/${m.id}`)} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 hover:bg-amber-100">
                {m.fullName} - {m.daysLeft}d left
              </button>
            ))}
          </div>
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <Input className="pl-9" placeholder="Search name, phone or member code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </Select>
        </div>

        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.data.length ? <Empty>No members found.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>Code</Th><Th>Name</Th><Th>Phone</Th><Th>Plan</Th><Th>Status</Th><Th>Expires</Th></tr></thead>
              <tbody>
                {list.data.data.map((m: any) => (
                  <tr key={m.id} onClick={() => nav(`/app/members/${m.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <Td className="font-mono text-xs">{m.memberCode}</Td>
                    <Td className="font-medium">{m.fullName}</Td>
                    <Td>{m.phone}</Td>
                    <Td><Badge tone={PLAN_TONE[m.plan.tier]}>{m.plan.name}</Badge></Td>
                    <Td><Badge tone={m.status === "active" ? "green" : "red"}>{m.status}</Badge></Td>
                    <Td>{fmtDate(m.expiresAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {creating && <NewMemberModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewMemberModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api("GET", "/plans") });
  const [f, setF] = useState({ fullName: "", phone: "", email: "", dateOfBirth: "", planTier: "silver", durationMonths: 1 });
  const set = (k: string, v: string | number) => setF((s) => ({ ...s, [k]: v }));

  // Business rule from the server: under 18 must be Junior, adults cannot be Junior.
  // We pre-select the right plan as soon as the date of birth is known.
  function onDob(dob: string) {
    setF((s) => {
      if (!dob) return { ...s, dateOfBirth: dob };
      const minor = ageOf(dob) < 18;
      return { ...s, dateOfBirth: dob, planTier: minor ? "junior" : s.planTier === "junior" ? "silver" : s.planTier };
    });
  }

  const create = useMutation({
    mutationFn: () => api("POST", "/members", {
      fullName: f.fullName.trim(), phone: f.phone.trim(), dateOfBirth: f.dateOfBirth,
      planTier: f.planTier, durationMonths: Number(f.durationMonths),
      ...(f.email.trim() ? { email: f.email.trim() } : {}),
    }),
    onSuccess: (m) => {
      toast.success(`${m.fullName} registered as ${m.memberCode}`);
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["members-expiring"] });
      onClose();
      nav(`/app/members/${m.id}`);
    },
  });

  const plan = plans.data?.find((p: any) => p.tier === f.planTier);
  const minor = f.dateOfBirth ? ageOf(f.dateOfBirth) < 18 : null;

  return (
    <Modal title="Register member" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} required minLength={2} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} required placeholder="9876543210" /></Field>
          <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(e) => onDob(e.target.value)} required max={new Date().toISOString().slice(0, 10)} /></Field>
        </div>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan" hint={minor === true ? "Under 18: Junior only" : minor === false ? "Adults: Gold or Silver" : undefined}>
            <Select value={f.planTier} onChange={(e) => set("planTier", e.target.value)}>
              {plans.data?.map((p: any) => (
                <option key={p.tier} value={p.tier} disabled={minor !== null && (p.tier === "junior") !== minor}>{p.name} - {inr(p.monthlyFee)}/mo</option>
              ))}
            </Select>
          </Field>
          <Field label="Months"><Input type="number" min={1} max={24} value={f.durationMonths} onChange={(e) => set("durationMonths", Number(e.target.value))} /></Field>
        </div>
        {plan && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">To collect: <b>{inr(plan.monthlyFee * f.durationMonths)}</b> ({f.durationMonths} x {inr(plan.monthlyFee)}). Courts {plan.courtDiscountPct === 100 ? "free" : `${plan.courtDiscountPct}% off`}, shop {plan.shopDiscountPct}% off, bar {plan.barDiscountPct}% off.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Register</Button>
        </div>
      </form>
    </Modal>
  );
}
