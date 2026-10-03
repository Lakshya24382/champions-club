import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { Field, inputCls, btnCls } from './ui.jsx';

export default function EnquiryForm({ plans = [] }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '', interestedPlanId: '', website: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const send = useMutation({
    mutationFn: () => api('/public/enquiries', {
      method: 'POST',
      body: {
        name: f.name,
        phone: f.phone,
        email: f.email || null,
        message: f.message || null,
        interestedPlanId: f.interestedPlanId ? Number(f.interestedPlanId) : null,
        website: f.website,
      },
    }),
  });

  if (send.isSuccess) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 text-emerald-900">
        <p className="text-lg font-semibold">Thank you! ✔</p>
        <p className="mt-1 text-sm">We have your message and someone from the club will contact you shortly.</p>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input required className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email (optional)"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
        <Field label="Interested in (optional)">
          <select className={inputCls} value={f.interestedPlanId} onChange={set('interestedPlanId')}>
            <option value="">Not sure yet</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} membership</option>)}
          </select>
        </Field>
      </div>
      <Field label="How can we help? (optional)">
        <textarea rows={3} className={inputCls} value={f.message} onChange={set('message')} />
      </Field>
      {/* Honeypot: invisible to people, tempting to bots */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={set('website')} />
      {send.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{send.error.message}</span>{' '}
          <button type="button" className="font-medium underline" onClick={() => send.reset()}>Try again</button>
        </div>
      )}
      <button className={btnCls} disabled={send.isPending}>{send.isPending ? 'Sending…' : 'Send enquiry'}</button>
    </form>
  );
}
