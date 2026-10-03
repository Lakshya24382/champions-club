import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from '../api';
import { Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';
import { InvoiceBadge } from './Invoices.jsx';

export default function InvoiceDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [method, setMethod] = useState('upi');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const { data: inv, isLoading, error } = useQuery({ queryKey: ['invoice', id], queryFn: () => api(`/invoices/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['invoice', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['fin-report'] });
  };
  const pay = useMutation({
    mutationFn: () => api(`/invoices/${id}/payments`, {
      method: 'POST', body: { method, amount: Number(amount || inv.balance), note: note || null },
    }),
    onSuccess: () => { setAmount(''); setNote(''); refresh(); },
  });
  const voidIt = useMutation({
    mutationFn: (reason) => api(`/invoices/${id}/void`, { method: 'POST', body: { reason } }),
    onSuccess: refresh,
  });


  const handleDownloadPdf = async () => {
    try {
      const blob = await apiBlob(`/invoices/${id}/pdf`);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${inv.invoice_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err.message);
    }
  };

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;

  const billTo = inv.kind === 'business'
    ? { name: inv.client_name, lines: [inv.client_address, inv.client_gstin && `GSTIN: ${inv.client_gstin}`, inv.client_email, inv.client_phone] }
    : { name: inv.member_name, lines: [`Member ${inv.member_code}`] };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/invoices" className="text-sm text-emerald-700 hover:underline">← All invoices</Link>
        <button className={btnGhostCls} onClick={handleDownloadPdf}>
          ⬇ Download PDF
        </button>
        <button className={btnGhostCls} onClick={() => window.print()}>🖨 Print</button>
      </div>

      <div id="invoice-print-area" className="rounded-xl border bg-white p-8 print:border-0 print:p-0">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-emerald-700">{inv.club.name}</p>
            <p className="whitespace-pre-line text-sm text-slate-600">{inv.club.address}</p>
            {inv.club.gstin && <p className="text-sm text-slate-600">GSTIN: {inv.club.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">TAX INVOICE</p>
            <p className="font-mono">{inv.invoice_no}</p>
            <div className="mt-1 print:hidden"><InvoiceBadge i={inv} /></div>
            <p className="mt-1 text-sm text-slate-600">Issued {inv.issue_date}{inv.kind === 'business' && <> · Due {inv.due_date}</>}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase text-slate-500">Bill to</p>
          <p className="font-semibold">{billTo.name}</p>
          {billTo.lines.filter(Boolean).map((l, i) => <p key={i} className="text-sm text-slate-600">{l}</p>)}
        </div>

        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {inv.items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.description}</td>
                <td className="py-2 text-right">{i.qty}</td>
                <td className="py-2 text-right">{money(i.unit_price)}</td>
                <td className="py-2 text-right">{i.tax_pct}% · {money(i.line_tax)}</td>
                <td className="py-2 text-right">{money(i.line_subtotal + i.line_tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(inv.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>GST</dt><dd>{money(inv.tax_total)}</dd></div>
          <div className="flex justify-between border-t pt-1 text-lg font-bold"><dt>Total</dt><dd>{money(inv.total)}</dd></div>
          {inv.kind === 'business' && inv.status !== 'void' && (
            <>
              <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>{money(inv.paid_amount)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{money(inv.balance)}</dd></div>
            </>
          )}
        </dl>
        {inv.notes && <p className="mt-4 text-sm text-slate-600">Notes: {inv.notes}</p>}
        {inv.status === 'void' && <p className="mt-4 rounded-lg bg-slate-100 p-2 text-sm">VOID: {inv.void_reason}</p>}
        {inv.kind === 'membership' && <p className="mt-4 text-sm text-slate-500">Paid in full at the club.</p>}
      </div>

      {inv.kind === 'business' && (
        <div className="space-y-3 rounded-xl border bg-white p-5 print:hidden">
          <h2 className="font-semibold">Payments</h2>
          {inv.payments.length === 0 && <p className="text-sm text-slate-500">Nothing received yet.</p>}
          <ul className="divide-y text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span><b className="uppercase">{p.method}</b> · {new Date(p.paid_at).toLocaleString()}{p.note && ` · ${p.note}`}{p.by_name && ` · ${p.by_name}`}</span>
                <b>{money(p.amount)}</b>
              </li>
            ))}
          </ul>

          {inv.status === 'issued' && (
            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <Field label="Method">
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option>
                </select>
              </Field>
              <Field label={`Amount (balance ${money(inv.balance)})`}>
                <input type="number" min="0" step="0.01" className={inputCls} placeholder={String(inv.balance)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button className={btnCls} disabled={pay.isPending} onClick={() => pay.mutate()}>Record payment</button>
            </div>
          )}
          {pay.error && <p className="text-sm text-red-600">{pay.error.message}</p>}
        </div>
      )}

      {inv.status !== 'void' && (
        <div className="print:hidden">
          <button className="text-sm text-red-600 hover:underline"
                  onClick={() => { const r = window.prompt('Reason for voiding this invoice?'); if (r) voidIt.mutate(r); }}>Void invoice</button>
          {voidIt.error && <p className="text-sm text-red-600">{voidIt.error.message}</p>}
        </div>
      )}
    </div>
  );
}
