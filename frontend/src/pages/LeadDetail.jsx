import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';
import { LeadStatusBadge, plusDays, waLink } from '../components/leadUi.jsx';

const KIND_ICON = { enquiry: '📨', trial: '🎾', note: '📝', call: '📞', status: '🔁', quote: '💬', converted: '🎉' };
const OPEN_STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'], ['trial_booked', 'Trial booked']];

function useRefreshLead(id) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['leads-summary'] });
    qc.invalidateQueries({ queryKey: ['members'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

// ------------------------------------------------------------------ new quote
function QuoteModal({ lead, onClose }) {
  const refresh = useRefreshLead(String(lead.id));
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });
  const firstPlan = lead.interested_plan_id ?? plans[0]?.id ?? '';
  const [planId, setPlanId] = useState(String(firstPlan));
  const [amount, setAmount] = useState('');
  const [validDays, setValidDays] = useState('14');
  const [message, setMessage] = useState('');

  const plan = plans.find((p) => p.id === Number(planId)) ?? plans[0];
  const shownAmount = amount === '' ? (plan?.price ?? '') : amount;

  const create = useMutation({
    mutationFn: () => api(`/leads/${lead.id}/quotes`, {
      method: 'POST',
      body: { planId: plan.id, amount: Number(shownAmount), validDays: Number(validDays), message: message || null },
    }),
    onSuccess: () => { refresh(); onClose(); },
  });

  if (!plan) return null;
  return (
    <Modal title={`New quote for ${lead.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Plan">
          <select className={inputCls} value={planId} onChange={(e) => { setPlanId(e.target.value); setAmount(''); }}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · list price {money(p.price)}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quoted amount (₹)"><input type="number" min="0" className={inputCls} value={shownAmount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Valid for (days)"><input type="number" min="1" max="90" className={inputCls} value={validDays} onChange={(e) => setValidDays(e.target.value)} /></Field>
        </div>
        {Number(shownAmount) < plan.price && (
          <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Discount of {money(plan.price - Number(shownAmount))} off the list price.</p>
        )}
        <Field label="Message shown on the quote (optional)">
          <input className={inputCls} placeholder="e.g. Welcome offer, first-year special" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending || shownAmount === ''} onClick={() => create.mutate()}>Create quote</button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ convert to member
function ConvertModal({ lead, onClose }) {
  const navigate = useNavigate();
  const refresh = useRefreshLead(String(lead.id));
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: () => api('/plans') });
  const liveQuotes = lead.quotes.filter((q) => q.status === 'sent' && !q.is_expired);
  const [quoteId, setQuoteId] = useState(liveQuotes[0] ? String(liveQuotes[0].id) : '');
  const [planId, setPlanId] = useState(String(lead.interested_plan_id ?? ''));
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [emergency, setEmergency] = useState('');

  const quote = liveQuotes.find((q) => q.id === Number(quoteId));

  const convert = useMutation({
    mutationFn: () => api(`/leads/${lead.id}/convert`, {
      method: 'POST',
      body: {
        ...(quote ? { quoteId: quote.id } : { planId: Number(planId) }),
        dateOfBirth: dob,
        gender: gender || null,
        emergencyContact: emergency || null,
      },
    }),
    onSuccess: (r) => { refresh(); navigate(`/members/${r.member.id}`); },
  });

  return (
    <Modal title={`Welcome ${lead.name} as a member`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); convert.mutate(); }}>
        <Field label="Use a quote">
          <select className={inputCls} value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
            <option value="">No quote: pick a plan at the list price</option>
            {liveQuotes.map((q) => <option key={q.id} value={q.id}>{q.quote_no} · {q.plan_name} · {money(q.amount)}</option>)}
          </select>
        </Field>
        {!quote && (
          <Field label="Plan">
            <select required className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select a plan…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}
            </select>
          </Field>
        )}
        {quote && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{quote.plan_name} plan at {money(quote.amount)}, as quoted.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth"><input required type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          <Field label="Gender (optional)">
            <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Emergency contact (optional)"><input className={inputCls} value={emergency} onChange={(e) => setEmergency(e.target.value)} /></Field>
        {convert.error && <p className="text-sm text-red-600">{convert.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={convert.isPending}>Create member</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ the page
export default function LeadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const refresh = useRefreshLead(id);
  const [quoting, setQuoting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [note, setNote] = useState({ kind: 'note', body: '', nextFollowUp: plusDays(3) });
  const [copied, setCopied] = useState(null);

  const { data: lead, isLoading, error } = useQuery({ queryKey: ['lead', id], queryFn: () => api(`/leads/${id}`) });

  const mut = useMutation({
    mutationFn: ({ path, method = 'PATCH', body }) => api(path, { method, body }),
    onSuccess: refresh,
  });
  const patch = (body) => mut.mutate({ path: `/leads/${id}`, body });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{error.message}</p>;

  const open = !['converted', 'lost'].includes(lead.status);
  const quoteLink = (q) => `${window.location.origin}/quote/${q.token}`;
  const quoteText = (q) =>
    `Hi ${lead.name}, here is your Champions Club ${q.plan_name} membership quote (${money(q.amount)}), valid until ${q.valid_until}: ${quoteLink(q)}`;
  const copy = async (q) => {
    await navigator.clipboard.writeText(quoteText(q));
    setCopied(q.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const markLost = () => {
    const reason = window.prompt('Why was this lead lost?');
    if (reason) patch({ status: 'lost', lostReason: reason });
  };

  const addNote = () => {
    mut.mutate({
      path: `/leads/${id}/notes`, method: 'POST',
      body: { kind: note.kind, body: note.body, nextFollowUp: note.nextFollowUp || null },
    }, { onSuccess: () => setNote({ kind: 'note', body: '', nextFollowUp: plusDays(3) }) });
  };

  return (
    <div className="space-y-4">
      <Link to="/leads" className="text-sm text-emerald-700 hover:underline">← All enquiries</Link>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            <p className="text-sm text-slate-600">
              <a className="text-emerald-700 hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>
              {lead.email && <> · <a className="text-emerald-700 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a></>}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              via {lead.source.replace('_', ' ')} · {new Date(lead.created_at).toLocaleString()}
              {lead.plan_name && <> · interested in <b>{lead.plan_name}</b></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LeadStatusBadge status={lead.status} />
            <a className="text-sm text-emerald-700 hover:underline" target="_blank" rel="noreferrer"
               href={waLink(lead.phone, `Hi ${lead.name}, this is Champions Club. Thanks for getting in touch!`)}>Message on WhatsApp ↗</a>
          </div>
        </div>

        {lead.message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">“{lead.message}”</p>}

        {lead.trial_start && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            🎾 Trial session: <b>{lead.trial_court}</b> on {new Date(lead.trial_start).toLocaleString()}
            {lead.trial_status === 'cancelled' && ' (cancelled)'}
          </p>
        )}
        {lead.status === 'lost' && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">Lost: {lead.lost_reason}</p>}
        {lead.status === 'converted' && (
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            🎉 Now a member. <Link className="underline" to={`/members/${lead.member_id}`}>Open {lead.member_code}</Link>
          </p>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Stage:</span>
            {OPEN_STATUSES.map(([v, label]) => (
              <button key={v} className={`rounded-full px-3 py-1 text-xs ${lead.status === v ? 'bg-emerald-600 text-white' : 'border hover:bg-slate-100'}`}
                      disabled={mut.isPending} onClick={() => lead.status !== v && patch({ status: v })}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Next follow-up
              <input type="date" className={`${inputCls} w-40`} value={lead.next_follow_up ?? ''}
                     onChange={(e) => patch({ nextFollowUp: e.target.value || null })} />
            </label>
            <span>Owner: <b>{lead.assigned_name ?? 'unassigned'}</b>{' '}
              {lead.assigned_to === user.id
                ? <button className="text-xs text-slate-500 underline" onClick={() => patch({ assignedTo: null })}>unassign</button>
                : <button className="text-xs text-emerald-700 underline" onClick={() => patch({ assignedTo: user.id })}>assign to me</button>}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <button className={btnCls} onClick={() => setQuoting(true)}>Send a quote</button>
            <button className={btnCls} onClick={() => setConverting(true)}>Convert to member</button>
            <button className="ml-auto text-sm text-red-600 hover:underline" onClick={markLost}>Mark as lost</button>
          </div>
        </div>
      )}
      {lead.status === 'lost' && (
        <button className={btnGhostCls} onClick={() => patch({ status: 'contacted', nextFollowUp: plusDays(1) })}>Reopen this enquiry</button>
      )}
      {mut.error && <p className="text-sm text-red-600">{mut.error.message}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-semibold">Log a call or note</h2>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select className={`${inputCls} w-28`} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })}>
                  <option value="note">Note</option><option value="call">Call</option>
                </select>
                <input type="date" className={`${inputCls} w-44`} title="Next follow-up" value={note.nextFollowUp} onChange={(e) => setNote({ ...note, nextFollowUp: e.target.value })} />
              </div>
              <textarea rows={2} className={inputCls} placeholder="What happened? (a call moves a New lead to Contacted)" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
              <button className={btnCls} disabled={!note.body.trim() || mut.isPending} onClick={addNote}>Save</button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 font-semibold">Quotes</h2>
            {lead.quotes.length === 0 && <p className="text-sm text-slate-500">No quotes yet.</p>}
            <ul className="space-y-3 text-sm">
              {lead.quotes.map((q) => (
                <li key={q.id} className="rounded-lg border p-3">
                  <div className="flex justify-between">
                    <b>{q.quote_no} · {q.plan_name}</b>
                    <b>{money(q.amount)}</b>
                  </div>
                  <p className="text-xs text-slate-500">
                    valid until {q.valid_until} ·{' '}
                    <span className={q.is_expired ? 'text-red-600' : q.status === 'accepted' ? 'text-emerald-700' : ''}>
                      {q.is_expired ? 'expired' : q.status}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <button className="text-emerald-700 underline" onClick={() => copy(q)}>{copied === q.id ? 'Copied ✔' : 'Copy message + link'}</button>
                    <a className="text-emerald-700 underline" target="_blank" rel="noreferrer" href={waLink(lead.phone, quoteText(q))}>Send on WhatsApp</a>
                    <a className="text-slate-500 underline" target="_blank" rel="noreferrer" href={quoteLink(q)}>Preview page</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-semibold">Timeline</h2>
          <ul className="space-y-3 text-sm">
            {lead.activities.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span>{KIND_ICON[a.kind]}</span>
                <span>
                  {a.body}
                  <br /><span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}{a.by_name && ` · ${a.by_name}`}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {quoting && <QuoteModal lead={lead} onClose={() => setQuoting(false)} />}
      {converting && <ConvertModal lead={lead} onClose={() => setConverting(false)} />}
    </div>
  );
}
