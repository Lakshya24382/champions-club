import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, StatusBadge, PlanBadge, money } from '../components/ui.jsx';

function NewMemberModal({ onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });
  const [f, setF] = useState({ fullName: '', phone: '', email: '', dateOfBirth: '', gender: '', emergencyContact: '', planId: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api('/members', {
      method: 'POST',
      body: {
        fullName: f.fullName,
        phone: f.phone,
        email: f.email || null,
        dateOfBirth: f.dateOfBirth,
        gender: f.gender || null,
        emergencyContact: f.emergencyContact || null,
        planId: Number(f.planId),
      },
    }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/members/${m.id}`);
    },
  });

  const plan = plans.find((p) => p.id === Number(f.planId));

  return (
    <Modal title="New member" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Full name"><input required className={inputCls} value={f.fullName} onChange={set('fullName')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input required className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Date of birth"><input required type="date" className={inputCls} value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (optional)"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
          <Field label="Gender (optional)">
            <select className={inputCls} value={f.gender} onChange={set('gender')}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Emergency contact (optional)"><input className={inputCls} value={f.emergencyContact} onChange={set('emergencyContact')} /></Field>
        <Field label="Plan">
          <select required className={inputCls} value={f.planId} onChange={set('planId')}>
            <option value="">Select a plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}
          </select>
        </Field>
        {plan && (
          <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            Courts {plan.court_discount_pct}% off · Shop {plan.shop_discount_pct}% off · Bar {plan.bar_discount_pct}% off · valid {plan.duration_days} days
          </p>
        )}
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>Create member</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Members() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members', search, status],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}&status=${status}`),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Members</h1>
        <button className={btnCls} onClick={() => setOpen(true)}>+ New member</button>
      </div>

      <div className="flex gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Search name, phone or CC-00001…"
               value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputCls} max-w-[10rem]`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Plan</th><th className="p-3">Expires</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={6}>Loading…</td></tr>}
            {members.map((m) => (
              <tr key={m.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{m.member_code}</td>
                <td className="p-3 font-medium"><Link className="text-emerald-700 hover:underline" to={`/members/${m.id}`}>{m.full_name}</Link></td>
                <td className="p-3">{m.phone}</td>
                <td className="p-3"><PlanBadge code={m.plan_code} name={m.plan_name} /></td>
                <td className="p-3">{m.expires_on}</td>
                <td className="p-3"><StatusBadge status={m.membership_status} /></td>
              </tr>
            ))}
            {!isLoading && members.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No members found.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <NewMemberModal onClose={() => setOpen(false)} />}
    </div>
  );
}
