import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import {
  Modal, Field, inputCls, btnCls, btnGhostCls,
  StatusBadge, PlanBadge, money, PageLoader, EmptyState, Table, Th, Td, toast,
} from '../components/ui.jsx';

function NewMemberModal({ onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });
  const [f, setF] = useState({
    fullName: '', phone: '', email: '', dateOfBirth: '', gender: '', emergencyContact: '', planId: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      api('/members', {
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
      toast('Member created successfully ✓');
      navigate(`/members/${m.id}`);
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const plan = plans.find((p) => p.id === Number(f.planId));

  return (
    <Modal title="New member" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Full name">
          <input required className={inputCls} value={f.fullName} onChange={set('fullName')} placeholder="e.g. Priya Sharma" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input required className={inputCls} value={f.phone} onChange={set('phone')} placeholder="9800000000" />
          </Field>
          <Field label="Date of birth">
            <input required type="date" className={inputCls} value={f.dateOfBirth} onChange={set('dateOfBirth')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (optional)">
            <input type="email" className={inputCls} value={f.email} onChange={set('email')} placeholder="priya@example.com" />
          </Field>
          <Field label="Gender (optional)">
            <select className={inputCls} value={f.gender} onChange={set('gender')}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Emergency contact (optional)">
          <input className={inputCls} value={f.emergencyContact} onChange={set('emergencyContact')} placeholder="Name & phone" />
        </Field>
        <Field label="Membership plan">
          <select required className={inputCls} value={f.planId} onChange={set('planId')}>
            <option value="">Select a plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>
            ))}
          </select>
        </Field>

        {plan && (
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 ring-1 ring-emerald-200">
            Courts {plan.court_discount_pct}% off · Shop {plan.shop_discount_pct}% off · Bar {plan.bar_discount_pct}% off · Valid for {plan.duration_days} days
          </div>
        )}

        {create.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {create.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create member'}
          </button>
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members</h1>
          <p className="mt-0.5 text-sm text-slate-500">{members.length} members shown</p>
        </div>
        <button className={btnCls} onClick={() => setOpen(true)}>
          + New member
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search name, phone or CC-00001…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} max-w-[11rem]`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <PageLoader />
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon="👥"
            title="No members found"
            description={search || status ? 'Try adjusting your search or filter.' : 'Add your first member to get started.'}
            action={
              !search && !status ? (
                <button className={btnCls} onClick={() => setOpen(true)}>+ New member</button>
              ) : null
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Plan</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id} className="transition hover:bg-slate-50">
                <Td>
                  <span className="font-mono text-xs text-slate-500">{m.member_code}</span>
                </Td>
                <Td>
                  <Link className="font-medium text-emerald-700 hover:underline" to={`/members/${m.id}`}>
                    {m.full_name}
                  </Link>
                </Td>
                <Td className="text-slate-600">{m.phone}</Td>
                <Td><PlanBadge code={m.plan_code} name={m.plan_name} /></Td>
                <Td className="text-slate-600 tabular-nums">{m.expires_on}</Td>
                <Td><StatusBadge status={m.membership_status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {open && <NewMemberModal onClose={() => setOpen(false)} />}
    </div>
  );
}
