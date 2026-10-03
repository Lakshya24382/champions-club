import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

const TABS = [['open', 'Outstanding'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void'], ['all', 'All']];

export function InvoiceBadge({ i }) {
  const [cls, label] = i.status === 'paid' ? ['bg-emerald-100 text-emerald-800', 'paid']
    : i.status === 'void' ? ['bg-slate-200 text-slate-600', 'void']
      : i.is_overdue ? ['bg-red-100 text-red-700', 'overdue'] : ['bg-amber-100 text-amber-800', 'outstanding'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function ClientModal({ onClose, onCreated }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', contactPerson: '', phone: '', email: '', gstin: '', address: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () => api('/invoices/clients', {
      method: 'POST',
      body: {
        name: f.name, contactPerson: f.contactPerson || null, phone: f.phone || null,
        email: f.email || null, gstin: f.gstin || null, address: f.address || null,
      },
    }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['clients'] }); onCreated(c); },
  });
  return (
    <Modal title="New business client" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="Company name"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact person"><input className={inputCls} value={f.contactPerson} onChange={set('contactPerson')} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
          <Field label="GSTIN"><input className={inputCls} value={f.gstin} onChange={set('gstin')} /></Field>
        </div>
        <Field label="Address"><textarea rows={2} className={inputCls} value={f.address} onChange={set('address')} /></Field>
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>Save client</button>
        </div>
      </form>
    </Modal>
  );
}

const blank = () => ({ description: '', qty: '1', unitPrice: '', taxPct: '18' });

function NewInvoiceModal({ onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => api('/invoices/clients') });
  const [clientId, setClientId] = useState('');
  const [dueDays, setDueDays] = useState('15');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([blank()]);
  const [addingClient, setAddingClient] = useState(false);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const calc = lines.map((l) => {
    const sub = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    return { sub, tax: (sub * (Number(l.taxPct) || 0)) / 100 };
  });
  const subtotal = calc.reduce((a, c) => a + c.sub, 0);
  const tax = calc.reduce((a, c) => a + c.tax, 0);

  const create = useMutation({
    mutationFn: () => api('/invoices', {
      method: 'POST',
      body: {
        clientId: Number(clientId), dueDays: Number(dueDays), notes: notes || null,
        items: lines.map((l) => ({
          description: l.description, qty: Number(l.qty), unitPrice: Number(l.unitPrice), taxPct: Number(l.taxPct),
        })),
      },
    }),
    onSuccess: (inv) => { qc.invalidateQueries({ queryKey: ['invoices'] }); navigate(`/invoices/${inv.id}`); },
  });

  return (
    <Modal title="New invoice" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Bill to">
              <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <button className={btnGhostCls} onClick={() => setAddingClient(true)}>+ New client</button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Items (prices excluding GST)</p>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className={`${inputCls} col-span-5`} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={`${inputCls} col-span-2`} type="number" min="1" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <input className={`${inputCls} col-span-2`} type="number" min="0" placeholder="Price" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <input className={`${inputCls} col-span-2`} type="number" min="0" max="100" placeholder="GST %" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: e.target.value })} />
              <button className="col-span-1 text-red-600 disabled:opacity-30" disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button className="text-sm text-emerald-700 hover:underline" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add item</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment due in (days)"><input type="number" min="0" max="120" className={inputCls} value={dueDays} onChange={(e) => setDueDays(e.target.value)} /></Field>
          <Field label="Notes (optional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>

        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span>GST</span><span>{money(tax)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{money(subtotal + tax)}</span></div>
        </div>

        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending || !clientId || lines.some((l) => !l.description.trim() || l.unitPrice === '')}
                  onClick={() => create.mutate()}>Create invoice</button>
        </div>
      </div>
      {addingClient && <ClientModal onClose={() => setAddingClient(false)} onCreated={(c) => { setClientId(String(c.id)); setAddingClient(false); }} />}
    </Modal>
  );
}

function MembershipInvoiceModal({ onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [member, setMember] = useState(null);

  const { data: found = [] } = useQuery({
    queryKey: ['member-search', search],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}&limit=5`),
    enabled: !member && search.length >= 2,
  });
  const { data: detail } = useQuery({
    queryKey: ['member', String(member?.id)],
    queryFn: () => api(`/members/${member.id}`),
    enabled: !!member,
  });

  const create = useMutation({
    mutationFn: (eventId) => api('/invoices/membership', { method: 'POST', body: { eventId } }),
    onSuccess: (inv) => { qc.invalidateQueries({ queryKey: ['invoices'] }); navigate(`/invoices/${inv.id}`); },
  });

  return (
    <Modal title="Invoice for a membership payment" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">A tax invoice for a payment that is already recorded. It does not add any revenue.</p>
      {!member ? (
        <div className="space-y-2">
          <input className={inputCls} placeholder="Search member name, phone or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {found.map((r) => (
            <button key={r.id} className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50" onClick={() => setMember(r)}>
              {r.full_name} <span className="text-slate-500">· {r.member_code} · {r.plan_name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm"><b>{member.full_name}</b> ({member.member_code}) <button className="ml-2 text-xs text-slate-500 underline" onClick={() => setMember(null)}>change</button></p>
          {detail?.events.filter((e) => e.amount > 0).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span><b className="capitalize">{e.event_type.replace('_', ' ')}</b> · {e.plan_name}<br /><span className="text-xs text-slate-500">{e.starts_on} → {e.ends_on}</span></span>
              <span className="flex items-center gap-3"><b>{money(e.amount)}</b>
                <button className={btnCls} disabled={create.isPending} onClick={() => create.mutate(e.id)}>Create invoice</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {create.error && <p className="mt-2 text-sm text-red-600">{create.error.message}</p>}
    </Modal>
  );
}

export default function Invoices() {
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);   // 'business' | 'membership'

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', tab, search],
    queryFn: () => api(`/invoices?status=${tab}&search=${encodeURIComponent(search)}`),
    placeholderData: (prev) => prev,
  });
  const owed = invoices.filter((i) => i.status === 'issued').reduce((a, i) => a + i.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <div className="flex gap-2">
          <button className={btnGhostCls} onClick={() => setModal('membership')}>Membership invoice</button>
          <button className={btnCls} onClick={() => setModal('business')}>+ New invoice</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={`rounded-full px-3 py-1 text-sm ${tab === k ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`}>{l}</button>
        ))}
        <input className={`${inputCls} ml-2 max-w-xs`} placeholder="Search number, client or member…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {owed > 0 && <span className="ml-auto text-sm text-slate-600">Outstanding in this list: <b>{money(owed)}</b></span>}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Invoice</th><th className="p-3">Bill to</th><th className="p-3">Issued</th><th className="p-3">Due</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={7}>Loading…</td></tr>}
            {invoices.map((i) => (
              <tr key={i.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium"><Link className="text-emerald-700 hover:underline" to={`/invoices/${i.id}`}>{i.invoice_no}</Link>
                  {i.kind === 'membership' && <span className="ml-2 text-xs text-slate-400">membership</span>}</td>
                <td className="p-3">{i.client_name ?? `${i.member_name} (${i.member_code})`}</td>
                <td className="p-3">{i.issue_date}</td>
                <td className="p-3">{i.due_date}</td>
                <td className="p-3 text-right">{money(i.total)}</td>
                <td className="p-3 text-right font-semibold">{money(i.balance)}</td>
                <td className="p-3"><InvoiceBadge i={i} /></td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={7}>No invoices here.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal === 'business' && <NewInvoiceModal onClose={() => setModal(null)} />}
      {modal === 'membership' && <MembershipInvoiceModal onClose={() => setModal(null)} />}
    </div>
  );
}
