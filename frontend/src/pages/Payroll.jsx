import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';
import { monthOf } from '../components/dates.js';

// ------------------------------------------------------------------ employees
function EmployeeModal({ employee, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    fullName: employee?.full_name ?? '', jobTitle: employee?.job_title ?? '', phone: employee?.phone ?? '',
    monthlySalary: String(employee?.monthly_salary ?? ''), joinedOn: employee?.joined_on ?? '',
    loginEmail: employee?.login_email ?? '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        fullName: f.fullName, jobTitle: f.jobTitle, phone: f.phone || null,
        monthlySalary: Number(f.monthlySalary), loginEmail: f.loginEmail || null,
        ...(f.joinedOn ? { joinedOn: f.joinedOn } : {}),
      };
      return employee
        ? api(`/hr/employees/${employee.id}`, { method: 'PATCH', body: { ...body, joinedOn: undefined } })
        : api('/hr/employees', { method: 'POST', body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); onClose(); },
  });

  return (
    <Modal title={employee ? `Edit ${employee.full_name}` : 'New employee'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name"><input required className={inputCls} value={f.fullName} onChange={set('fullName')} /></Field>
          <Field label="Job title"><input required className={inputCls} value={f.jobTitle} onChange={set('jobTitle')} /></Field>
          <Field label="Monthly salary (₹)"><input required type="number" min="0" className={inputCls} value={f.monthlySalary} onChange={set('monthlySalary')} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
          {!employee && <Field label="Joined on"><input type="date" className={inputCls} value={f.joinedOn} onChange={set('joinedOn')} /></Field>}
          <Field label="Staff login email (lets them request leave)"><input type="email" className={inputCls} value={f.loginEmail} onChange={set('loginEmail')} /></Field>
        </div>
        {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function EmployeesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(undefined);   // undefined = closed, null = new, object = edit
  const { data: employees = [], isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => api('/hr/employees') });
  const toggle = useMutation({
    mutationFn: (e) => api(`/hr/employees/${e.id}`, { method: 'PATCH', body: { isActive: !e.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
  const monthly = employees.filter((e) => e.is_active).reduce((a, e) => a + e.monthly_salary, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Monthly salary bill (active staff): <b>{money(monthly)}</b></p>
        <button className={btnCls} onClick={() => setEditing(null)}>+ New employee</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Name</th><th className="p-3">Title</th><th className="p-3 text-right">Salary / month</th><th className="p-3">Joined</th><th className="p-3">Login</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={6}>Loading…</td></tr>}
            {employees.map((e) => (
              <tr key={e.id} className={`border-t ${e.is_active ? '' : 'text-slate-400'}`}>
                <td className="p-3 font-medium">{e.full_name}{!e.is_active && ` (left ${e.left_on})`}</td>
                <td className="p-3">{e.job_title}</td>
                <td className="p-3 text-right">{money(e.monthly_salary)}</td>
                <td className="p-3">{e.joined_on}</td>
                <td className="p-3 text-xs">{e.login_email ?? '—'}</td>
                <td className="p-3 text-right">
                  <button className="mr-3 text-emerald-700 hover:underline" onClick={() => setEditing(e)}>Edit</button>
                  <button className="text-slate-500 hover:underline" onClick={() => toggle.mutate(e)}>{e.is_active ? 'Mark as left' : 'Reactivate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && <EmployeeModal employee={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

// ------------------------------------------------------------------ payroll runs
function PayslipRow({ p, editable, onSaved }) {
  const [bonus, setBonus] = useState(String(p.bonus));
  const [other, setOther] = useState(String(p.other_deduction));
  const [note, setNote] = useState(p.note ?? '');
  const save = useMutation({
    mutationFn: () => api(`/hr/payroll/payslips/${p.id}`, {
      method: 'PATCH', body: { bonus: Number(bonus || 0), otherDeduction: Number(other || 0), note: note || null },
    }),
    onSuccess: onSaved,
  });
  const dirty = Number(bonus || 0) !== p.bonus || Number(other || 0) !== p.other_deduction || (note || '') !== (p.note ?? '');

  return (
    <tr className="border-t">
      <td className="p-3 font-medium">{p.full_name}<span className="block text-xs font-normal text-slate-500">{p.job_title}</span></td>
      <td className="p-3 text-right">{money(p.base_salary)}</td>
      <td className="p-3 text-right text-red-600">{p.unpaid_leave_days > 0 ? `−${money(p.leave_deduction)} (${p.unpaid_leave_days}d)` : '—'}</td>
      <td className="p-3 text-right">{editable ? <input type="number" min="0" className={`${inputCls} w-24 text-right`} value={bonus} onChange={(e) => setBonus(e.target.value)} /> : money(p.bonus)}</td>
      <td className="p-3 text-right">{editable ? <input type="number" min="0" className={`${inputCls} w-24 text-right`} value={other} onChange={(e) => setOther(e.target.value)} /> : money(p.other_deduction)}</td>
      <td className="p-3">{editable ? <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /> : (p.note ?? '')}</td>
      <td className="p-3 text-right font-bold">{money(p.net_pay)}</td>
      <td className="p-3">{editable && dirty && <button className={btnCls} disabled={save.isPending} onClick={() => save.mutate()}>Save</button>}
        {save.error && <span className="text-xs text-red-600">{save.error.message}</span>}</td>
    </tr>
  );
}

function RunDetail({ id, onBack }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState('upi');
  const { data: run, isLoading } = useQuery({ queryKey: ['payroll-run', id], queryFn: () => api(`/hr/payroll/runs/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll-run', id] });
    qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    qc.invalidateQueries({ queryKey: ['fin-report'] });
  };
  const pay = useMutation({ mutationFn: () => api(`/hr/payroll/runs/${id}/pay`, { method: 'POST', body: { method } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => api(`/hr/payroll/runs/${id}`, { method: 'DELETE' }), onSuccess: () => { refresh(); onBack(); } });

  if (isLoading) return <p>Loading…</p>;
  const draft = run.status === 'draft';

  return (
    <div className="space-y-3">
      <button className="text-sm text-emerald-700 hover:underline" onClick={onBack}>← All payroll runs</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Payroll {run.month}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${draft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{draft ? 'draft' : `paid via ${run.payment_method}`}</span>
        </h2>
        <p className="text-lg font-bold">Total {money(run.total)}</p>
      </div>
      {draft && <p className="text-sm text-slate-600">Check each payslip, add a bonus or deduction if needed, then mark the run as paid. Approved unpaid leave has already been deducted. If leave changes, delete this draft and generate it again.</p>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Employee</th><th className="p-3 text-right">Earned</th><th className="p-3 text-right">Unpaid leave</th><th className="p-3 text-right">Bonus</th><th className="p-3 text-right">Other deduction</th><th className="p-3">Note</th><th className="p-3 text-right">Net pay</th><th className="p-3" /></tr>
          </thead>
          <tbody>{run.payslips.map((p) => <PayslipRow key={`${p.id}-${p.net_pay}`} p={p} editable={draft} onSaved={refresh} />)}</tbody>
        </table>
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-3">
          <select className={`${inputCls} w-32`} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="upi">Paid by UPI</option><option value="cash">Paid in cash</option><option value="card">Paid by card</option>
          </select>
          <button className={btnCls} disabled={pay.isPending} onClick={() => window.confirm(`Mark ${money(run.total)} as paid? The run will be locked.`) && pay.mutate()}>Mark as paid</button>
          <button className="ml-auto text-sm text-red-600 hover:underline" onClick={() => window.confirm('Delete this draft?') && del.mutate()}>Delete draft</button>
        </div>
      )}
      {(pay.error || del.error) && <p className="text-sm text-red-600">{(pay.error || del.error).message}</p>}
    </div>
  );
}

function RunsTab() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthOf(-1));
  const [open, setOpen] = useState(null);
  const { data: runs = [], isLoading } = useQuery({ queryKey: ['payroll-runs'], queryFn: () => api('/hr/payroll/runs') });
  const gen = useMutation({
    mutationFn: () => api('/hr/payroll/runs', { method: 'POST', body: { month } }),
    onSuccess: (run) => { qc.invalidateQueries({ queryKey: ['payroll-runs'] }); setOpen(run.id); },
  });

  if (open) return <RunDetail id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <Field label="Generate payroll for month"><input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <button className={btnCls} disabled={gen.isPending || !month} onClick={() => gen.mutate()}>Generate</button>
        {gen.error && <p className="text-sm text-red-600">{gen.error.message}</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Month</th><th className="p-3">Employees</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={4}>Loading…</td></tr>}
            {runs.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setOpen(r.id)}>
                <td className="p-3 font-medium text-emerald-700">{r.month}</td>
                <td className="p-3">{r.employees}</td>
                <td className="p-3 text-right">{money(r.total)}</td>
                <td className="p-3">{r.status === 'paid' ? <span className="text-emerald-700">paid · {r.payment_method}</span> : <span className="text-amber-700">draft (unpaid)</span>}</td>
              </tr>
            ))}
            {!isLoading && runs.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={4}>No payroll runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Payroll() {
  const [tab, setTab] = useState('runs');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Payroll</h1>
      <div className="flex gap-2">
        {[['runs', 'Monthly payroll'], ['employees', 'Employees']].map(([k, l]) => (
          <button key={k} className={tab === k ? btnCls : btnGhostCls} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'runs' ? <RunsTab /> : <EmployeesTab />}
    </div>
  );
}
