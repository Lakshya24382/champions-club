import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { cn, fmtDate, inr, todayStr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Td, Th } from "../components/ui";

function previousMonth() {
  const [y, m] = todayStr().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export default function PayrollPage() {
  const [tab, setTab] = useState<"employees" | "payroll">("payroll");
  return (
    <>
      <PageHeader title="Staff and payroll" subtitle="Employees, monthly payslips (salary minus unpaid leave, plus bonus)." />
      <div className="mb-4 flex gap-2">
        {([["payroll", "Payroll"], ["employees", "Employees"]] as const).map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={cn("rounded-full px-3 py-1 text-sm", tab === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</button>)}
      </div>
      {tab === "payroll" ? <Payroll /> : <Employees />}
    </>
  );
}

function Payroll() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(previousMonth());
  const [bonus, setBonus] = useState<any>(null);
  const [paying, setPaying] = useState<any>(null);

  const data = useQuery({ queryKey: ["payroll", month], queryFn: () => api("GET", `/finance/payroll?month=${month}`), enabled: /^\d{4}-\d{2}$/.test(month) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["payroll"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const run = useMutation({
    mutationFn: () => api("POST", "/finance/payroll/run", { month }),
    onSuccess: (r) => { toast.success(`${r.generated} payslip(s) generated, ${r.skippedExisting} already existed`); refresh(); },
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Month"><Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Button loading={run.isPending} onClick={() => run.mutate()}>Run payroll for this month</Button>
        <p className="text-xs text-slate-400">Only completed months. Running it again skips payslips that already exist.</p>
      </div>
      {data.isLoading ? <Spinner /> : data.error ? <ErrorBox error={data.error} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Net payroll" value={inr(data.data.totals.net)} />
            <Stat label="Paid" value={inr(data.data.totals.paid)} tone="good" />
            <Stat label="Still to pay" value={inr(data.data.totals.unpaid)} tone={data.data.totals.unpaid > 0 ? "bad" : undefined} />
          </div>
          <Card className="mt-6">
            {!data.data.payslips.length ? <Empty>No payslips for this month yet. Run payroll above.</Empty> : (
              <Table>
                <thead><tr><Th>Employee</Th><Th right>Salary</Th><Th right>Days</Th><Th right>Unpaid leave</Th><Th right>Deduction</Th><Th right>Bonus</Th><Th right>Net pay</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {data.data.payslips.map((p: any) => (
                    <tr key={p.id}>
                      <Td><div className="font-medium">{p.employee}</div><div className="text-xs text-slate-400">{p.code} - {p.title}</div></Td>
                      <Td right>{inr(p.baseSalary)}</Td>
                      <Td right>{p.daysEmployed}/{p.daysInMonth}</Td>
                      <Td right>{p.unpaidLeaveDays}</Td>
                      <Td right>{p.deduction > 0 ? `-${inr(p.deduction)}` : "-"}</Td>
                      <Td right>{p.bonus > 0 ? inr(p.bonus) : "-"}</Td>
                      <Td right className="font-semibold">{inr(p.netPay)}</Td>
                      <Td>{p.status === "paid" ? <Badge tone="green">paid {p.paidMethod}</Badge> : <Badge tone="amber">unpaid</Badge>}</Td>
                      <Td right>{p.status === "unpaid" && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setBonus(p)}>Bonus</Button><Button size="sm" variant="secondary" onClick={() => setPaying(p)}>Pay</Button></div>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
      {bonus && <BonusModal slip={bonus} onClose={() => setBonus(null)} onDone={refresh} />}
      {paying && <PaySlipModal slip={paying} onClose={() => setPaying(null)} onDone={refresh} />}
    </>
  );
}

function BonusModal({ slip, onClose, onDone }: { slip: any; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(slip.bonus);
  const save = useMutation({ mutationFn: () => api("PATCH", `/finance/payslips/${slip.id}`, { bonus: v }), onSuccess: (r) => { toast.success(`Net pay is now ${inr(r.netPay)}`); onDone(); onClose(); } });
  return (
    <Modal title={`Bonus: ${slip.employee}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Bonus (INR)" hint="Replaces any bonus already set."><Input type="number" min={0} value={v} onChange={(e) => setV(Number(e.target.value))} autoFocus /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
      </div>
    </Modal>
  );
}

function PaySlipModal({ slip, onClose, onDone }: { slip: any; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState("upi");
  const pay = useMutation({ mutationFn: () => api("POST", `/finance/payslips/${slip.id}/pay`, { method }), onSuccess: () => { toast.success("Salary marked paid"); onDone(); onClose(); } });
  return (
    <Modal title={`Pay ${slip.employee}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Net pay <b>{inr(slip.netPay)}</b>. A paid payslip is final and cannot be edited.</p>
        <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="upi">UPI / bank transfer</option><option value="cash">Cash</option><option value="card">Card</option></Select></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={pay.isPending} onClick={() => pay.mutate()}>Mark paid</Button></div>
      </div>
    </Modal>
  );
}

function Employees() {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const list = useQuery({ queryKey: ["employees", all], queryFn: () => api("GET", `/hr/employees?includeInactive=${all}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["employees"] });

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include inactive</label>
        <Button onClick={() => setCreating(true)}><Plus size={16} /> Add employee</Button>
      </div>
      <Card>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.length ? <Empty>No employees yet.</Empty> : (
          <Table>
            <thead><tr><Th>Code</Th><Th>Name</Th><Th>Title</Th><Th right>Salary / month</Th><Th>Joined</Th><Th right>Paid leave left</Th><Th /></tr></thead>
            <tbody>
              {list.data.map((e: any) => (
                <tr key={e.id}>
                  <Td className="font-mono text-xs">{e.employeeCode}</Td>
                  <Td className="font-medium">{e.fullName} {!e.isActive && <Badge tone="red">inactive</Badge>}{e.userId && <span className="ml-1 text-xs text-slate-400">login linked</span>}</Td>
                  <Td>{e.title}</Td><Td right>{inr(e.monthlySalary)}</Td><Td>{fmtDate(e.joinedOn)}</Td>
                  <Td right>{e.leave.remaining} of {e.leave.allowance}</Td>
                  <Td right><Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {creating && <EmployeeModal onClose={() => setCreating(false)} onDone={refresh} />}
      {editing && <EmployeeModal employee={editing} onClose={() => setEditing(null)} onDone={refresh} />}
    </>
  );
}

function EmployeeModal({ employee, onClose, onDone }: { employee?: any; onClose: () => void; onDone: () => void }) {
  const edit = Boolean(employee);
  const [f, setF] = useState({ fullName: employee?.fullName ?? "", title: employee?.title ?? "", monthlySalary: employee?.monthlySalary ?? 0, joinedOn: employee?.joinedOn ?? "", email: employee?.email ?? "", phone: employee?.phone ?? "", userId: employee?.userId ? String(employee.userId) : "", isActive: employee?.isActive ?? true });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => edit
      ? api("PATCH", `/hr/employees/${employee.id}`, { title: f.title.trim(), monthlySalary: f.monthlySalary, isActive: f.isActive, ...(f.email.trim() ? { email: f.email.trim() } : {}), ...(f.phone.trim() ? { phone: f.phone.trim() } : {}), ...(f.userId ? { userId: Number(f.userId) } : {}) })
      : api("POST", "/hr/employees", { fullName: f.fullName.trim(), title: f.title.trim(), monthlySalary: f.monthlySalary, ...(f.joinedOn ? { joinedOn: f.joinedOn } : {}), ...(f.email.trim() ? { email: f.email.trim() } : {}), ...(f.phone.trim() ? { phone: f.phone.trim() } : {}), ...(f.userId ? { userId: Number(f.userId) } : {}) }),
    onSuccess: () => { toast.success(edit ? "Employee updated" : "Employee added"); onDone(); onClose(); },
  });
  return (
    <Modal title={edit ? `Edit ${employee.fullName}` : "Add employee"} onClose={onClose}>
      <div className="space-y-4">
        {!edit && <Field label="Full name"><Input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Job title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Monthly salary (INR)"><Input type="number" min={0} value={f.monthlySalary} onChange={(e) => set("monthlySalary", Number(e.target.value))} /></Field>
          {!edit && <Field label="Joined on (default today)"><Input type="date" value={f.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} /></Field>}
          <Field label="Staff login id (optional)" hint="Lets them request leave themselves."><Input type="number" value={f.userId} onChange={(e) => set("userId", e.target.value)} /></Field>
          <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone (optional)"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </div>
        {edit && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (inactive staff are skipped in payroll)</label>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={f.title.trim().length < 2 || (!edit && f.fullName.trim().length < 2)} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
      </div>
    </Modal>
  );
}
