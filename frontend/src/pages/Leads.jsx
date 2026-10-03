import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, toast } from '../components/ui.jsx';
import { LeadStatusBadge, todayStr } from '../components/leadUi.jsx';

const TABS = [
  ['open', 'Open'], ['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'],
  ['trial_booked', 'Trial booked'], ['converted', 'Converted'], ['lost', 'Lost'],
];

function NewLeadModal({ onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });
  const [f, setF] = useState({ name: '', phone: '', email: '', source: 'phone', interestedPlanId: '', message: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api('/leads', {
      method: 'POST',
      body: {
        name: f.name, phone: f.phone, email: f.email || null, source: f.source,
        interestedPlanId: f.interestedPlanId ? Number(f.interestedPlanId) : null,
        message: f.message || null,
      },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-summary'] });
      if (r?.duplicate) toast('Phone number already has an open enquiry — note added to existing lead', 'info');
      else toast('Enquiry logged successfully ✓');
      if (r?.lead?.id) navigate(`/leads/${r.lead.id}`);
      else onClose();
    },
    onError: (err) => toast(err.message, 'error'),
  });

  return (
    <Modal title="Log an enquiry" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
          <Field label="Phone"><input required className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (optional)"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
          <Field label="How did they reach us?">
            <select className={inputCls} value={f.source} onChange={set('source')}>
              <option value="phone">Phone call</option><option value="walk_in">Walk-in</option>
              <option value="referral">Referral</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Interested in (optional)">
          <select className={inputCls} value={f.interestedPlanId} onChange={set('interestedPlanId')}>
            <option value="">Not sure</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="What did they ask? (optional)"><textarea rows={2} className={inputCls} value={f.message} onChange={set('message')} /></Field>
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <p className="text-xs text-slate-500">If this phone number already has an open enquiry, the note is added to it instead of creating a duplicate.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>Save enquiry</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Leads() {
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [due, setDue] = useState(false);
  const [mine, setMine] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data: summary } = useQuery({ queryKey: ['leads-summary'], queryFn: () => api('/leads/summary'), refetchInterval: 30_000 });
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', tab, search, due, mine],
    queryFn: () => api(`/leads?status=${tab}&search=${encodeURIComponent(search)}${due ? '&due=1' : ''}${mine ? '&mine=1' : ''}`),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });

  const count = (key) => (key === 'open' ? summary?.open_count : summary?.by_status?.[key]) ?? 0;
  const today = todayStr();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Enquiries</h1>
        <button className={btnCls} onClick={() => setAdding(true)}>+ Log enquiry</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`rounded-full px-3 py-1 text-sm ${tab === key ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`}>
            {label} <span className="opacity-70">{count(key)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Search name, phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} /> Follow-up due</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Source</th><th className="p-3">Interested in</th><th className="p-3">Status</th><th className="p-3">Follow up</th><th className="p-3">Owner</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={7}>Loading…</td></tr>}
            {leads.map((l) => {
              const open = !['converted', 'lost'].includes(l.status);
              const overdue = open && l.next_follow_up && l.next_follow_up <= today;
              return (
                <tr key={l.id} className={`border-t hover:bg-slate-50 ${l.status === 'new' ? 'bg-red-50/40' : ''}`}>
                  <td className="p-3 font-medium"><Link className="text-emerald-700 hover:underline" to={`/leads/${l.id}`}>{l.name}</Link></td>
                  <td className="p-3">{l.phone}</td>
                  <td className="p-3 capitalize">{l.source.replace('_', ' ')}</td>
                  <td className="p-3">{l.plan_name ?? '—'}</td>
                  <td className="p-3"><LeadStatusBadge status={l.status} /></td>
                  <td className={`p-3 ${overdue ? 'font-semibold text-red-600' : ''}`}>{l.next_follow_up ?? '—'}{overdue && l.next_follow_up < today && ' (overdue)'}</td>
                  <td className="p-3">{l.assigned_name ?? <span className="text-slate-400">unassigned</span>}</td>
                </tr>
              );
            })}
            {!isLoading && leads.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={7}>No enquiries here.</td></tr>}
          </tbody>
        </table>
      </div>

      {adding && <NewLeadModal onClose={() => setAdding(false)} />}
    </div>
  );
}
