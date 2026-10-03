import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

const CATEGORIES = ['rent', 'utilities', 'maintenance', 'supplies', 'marketing', 'equipment', 'inventory', 'professional', 'other'];
const mini = 'rounded border px-2 py-1 text-xs font-medium uppercase hover:bg-emerald-50 disabled:opacity-50';

function BillModal({ onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ category: 'utilities', vendor: '', description: '', amount: '', taxAmount: '0', dueDate: '', paidWith: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () => api('/expenses', {
      method: 'POST',
      body: {
        category: f.category, vendor: f.vendor, description: f.description || null,
        amount: Number(f.amount), taxAmount: Number(f.taxAmount || 0),
        dueDate: f.dueDate || null, paidWith: f.paidWith || null,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['fin-report'] }); onClose(); },
  });
  return (
    <Modal title="Add a bill or expense" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className={inputCls} value={f.category} onChange={set('category')}>
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </Field>
          <Field label="Vendor"><input required className={inputCls} value={f.vendor} onChange={set('vendor')} /></Field>
        </div>
        <Field label="Description (optional)"><input className={inputCls} value={f.description} onChange={set('description')} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total amount (₹)"><input required type="number" min="0.01" step="0.01" className={inputCls} value={f.amount} onChange={set('amount')} /></Field>
          <Field label="GST inside it (₹)"><input type="number" min="0" step="0.01" className={inputCls} value={f.taxAmount} onChange={set('taxAmount')} /></Field>
          <Field label="Due date"><input type="date" className={inputCls} value={f.dueDate} onChange={set('dueDate')} /></Field>
        </div>
        <Field label="Already paid?">
          <select className={inputCls} value={f.paidWith} onChange={set('paidWith')}>
            <option value="">No, still to pay</option><option value="cash">Yes, paid cash</option>
            <option value="card">Yes, paid by card</option><option value="upi">Yes, paid by UPI</option>
          </select>
        </Field>
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Expenses() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('unpaid');
  const [adding, setAdding] = useState(false);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['expenses', status],
    queryFn: () => api(`/expenses?status=${status}`),
    placeholderData: (prev) => prev,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['fin-report'] }); };
  const pay = useMutation({ mutationFn: ({ id, method }) => api(`/expenses/${id}/pay`, { method: 'POST', body: { method } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id) => api(`/expenses/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  const unpaidTotal = bills.filter((b) => b.status === 'unpaid').reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bills & expenses</h1>
        <button className={btnCls} onClick={() => setAdding(true)}>+ Add bill</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[['unpaid', 'To pay'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)}
                  className={`rounded-full px-3 py-1 text-sm ${status === k ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`}>{l}</button>
        ))}
        {unpaidTotal > 0 && <span className="ml-auto text-sm text-slate-600">To pay in this list: <b>{money(unpaidTotal)}</b></span>}
      </div>

      {(pay.error || del.error) && <p className="text-sm text-red-600">{(pay.error || del.error).message}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Date</th><th className="p-3">Vendor</th><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={7}>Loading…</td></tr>}
            {bills.map((b) => (
              <tr key={b.id} className={`border-t ${b.is_overdue ? 'bg-red-50' : ''}`}>
                <td className="p-3">{b.expense_date}</td>
                <td className="p-3 font-medium">{b.vendor}{b.description && <span className="block text-xs font-normal text-slate-500">{b.description}</span>}</td>
                <td className="p-3 capitalize">{b.category}</td>
                <td className="p-3 text-right">{money(b.amount)}{b.tax_amount > 0 && <span className="block text-xs text-slate-500">GST {money(b.tax_amount)}</span>}</td>
                <td className={`p-3 ${b.is_overdue ? 'font-semibold text-red-600' : ''}`}>{b.due_date ?? '—'}{b.is_overdue && ' (overdue)'}</td>
                <td className="p-3">{b.status === 'paid' ? <span className="text-emerald-700">paid · {b.payment_method}</span> : 'unpaid'}</td>
                <td className="p-3 text-right">
                  {b.status === 'unpaid' && (
                    <span className="flex justify-end gap-1">
                      {['cash', 'card', 'upi'].map((m) => (
                        <button key={m} className={mini} disabled={pay.isPending} onClick={() => pay.mutate({ id: b.id, method: m })}>{m}</button>
                      ))}
                      <button className="px-1 text-red-600" title="Delete" onClick={() => window.confirm('Delete this bill?') && del.mutate(b.id)}>✕</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && bills.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={7}>Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Tap cash, card or UPI on an unpaid bill to mark it paid with that method.</p>
      {adding && <BillModal onClose={() => setAdding(false)} />}
    </div>
  );
}
