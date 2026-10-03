import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls } from '../components/ui.jsx';
import { presetRange } from '../components/dates.js';
import ReportView from '../components/ReportView.jsx';

const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month']];

async function downloadCsv({ from, to }) {
  const res = await fetch(`/api/finance/report.csv?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `champions-report-${from}_to_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ShareModal({ range, onClose }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(`Club report ${range.from} to ${range.to}`);
  const [days, setDays] = useState('30');
  const [copied, setCopied] = useState(null);
  const link = (t) => `${window.location.origin}/report/${t}`;

  const { data: shares = [] } = useQuery({ queryKey: ['fin-shares'], queryFn: () => api('/finance/shares') });
  const create = useMutation({
    mutationFn: () => api('/finance/shares', {
      method: 'POST', body: { title, from: range.from, to: range.to, validDays: Number(days) },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-shares'] }),
  });
  const revoke = useMutation({
    mutationFn: (id) => api(`/finance/shares/${id}/revoke`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-shares'] }),
  });
  const copy = async (s) => {
    await navigator.clipboard.writeText(link(s.token));
    setCopied(s.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Modal title="Share these numbers" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Creates a link with a <b>frozen copy</b> of the report for {range.from} to {range.to}. People with the link see these numbers only,
        never your live data. You can revoke it any time.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field></div>
        <Field label="Valid for (days)"><input type="number" min="1" max="365" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
      {create.error && <p className="mt-2 text-sm text-red-600">{create.error.message}</p>}
      <button className={`${btnCls} mt-3`} disabled={create.isPending || title.trim().length < 2} onClick={() => create.mutate()}>Create link</button>

      <h3 className="mb-2 mt-5 text-sm font-semibold">Your links</h3>
      {shares.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
      <ul className="space-y-2 text-sm">
        {shares.map((s) => {
          const dead = s.revoked || s.expired;
          return (
            <li key={s.id} className="rounded-lg border p-2">
              <div className="flex justify-between gap-2">
                <b className={dead ? 'text-slate-400 line-through' : ''}>{s.title}</b>
                <span className="text-xs text-slate-500">{s.revoked ? 'revoked' : s.expired ? 'expired' : `until ${new Date(s.expires_at).toLocaleDateString()}`}</span>
              </div>
              <p className="text-xs text-slate-500">{s.from_date} to {s.to_date}</p>
              {!dead && (
                <div className="mt-1 flex gap-3 text-xs">
                  <button className="text-emerald-700 underline" onClick={() => copy(s)}>{copied === s.id ? 'Copied ✔' : 'Copy link'}</button>
                  <a className="text-slate-500 underline" target="_blank" rel="noreferrer" href={link(s.token)}>Open</a>
                  <button className="text-red-600 underline" onClick={() => revoke.mutate(s.id)}>Revoke</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function SettingsForm({ initial, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => api('/finance/settings', {
      method: 'PATCH',
      body: {
        tax_courts: Number(f.tax_courts), tax_membership: Number(f.tax_membership),
        tax_shop: Number(f.tax_shop), tax_bar: Number(f.tax_bar),
        annual_leave_days: Number(f.annual_leave_days),
        club_name: f.club_name, club_gstin: f.club_gstin, club_address: f.club_address,
      },
    }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  return (
    <Modal title="Tax rates and club details" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">Prices are treated as tax-inclusive. Confirm the right rates with your accountant.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['tax_courts', 'Courts GST %'], ['tax_membership', 'Memberships GST %'], ['tax_shop', 'Shop GST %'], ['tax_bar', 'Bar GST %']].map(([k, l]) => (
          <Field key={k} label={l}><input type="number" min="0" max="100" step="0.5" className={inputCls} value={f[k]} onChange={set(k)} /></Field>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Paid leave days per year"><input type="number" min="0" className={inputCls} value={f.annual_leave_days} onChange={set('annual_leave_days')} /></Field>
        <Field label="Club GSTIN (printed on invoices)"><input className={inputCls} value={f.club_gstin} onChange={set('club_gstin')} /></Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Club name"><input className={inputCls} value={f.club_name} onChange={set('club_name')} /></Field>
        <Field label="Address (printed on invoices)"><textarea rows={2} className={inputCls} value={f.club_address} onChange={set('club_address')} /></Field>
      </div>
      {save.error && <p className="mt-2 text-sm text-red-600">{save.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhostCls} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={save.isPending} onClick={() => save.mutate()}>Save</button>
      </div>
    </Modal>
  );
}

function SettingsModal({ onClose }) {
  const { data } = useQuery({ queryKey: ['fin-settings'], queryFn: () => api('/finance/settings') });
  if (!data) return null;
  return <SettingsForm initial={data} onClose={onClose} />;
}

export default function Finance() {
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presetRange('month'));
  const [sharing, setSharing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [dlError, setDlError] = useState('');

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['fin-report', range.from, range.to],
    queryFn: () => api(`/finance/report?from=${range.from}&to=${range.to}`),
    placeholderData: (prev) => prev,
  });

  const pick = (p) => { setPreset(p); setRange(presetRange(p)); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">How the club is doing</h1>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhostCls} onClick={() => setSettings(true)}>Tax & settings</button>
          <button className={btnGhostCls} onClick={() => downloadCsv(range).catch((e) => setDlError(e.message))}>Download CSV</button>
          <button className={btnCls} onClick={() => setSharing(true)}>Share…</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, l]) => (
          <button key={k} className={preset === k ? btnCls : btnGhostCls} onClick={() => pick(k)}>{l}</button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        <input type="date" className={`${inputCls} w-40`} value={range.from} max={range.to}
               onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} />
        <span className="text-slate-500">to</span>
        <input type="date" className={`${inputCls} w-40`} value={range.to} min={range.from}
               onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} />
      </div>
      {dlError && <p className="text-sm text-red-600">{dlError}</p>}

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-600">{error.message}</p>}
      {r && <ReportView r={r} internal />}

      {sharing && <ShareModal range={range} onClose={() => setSharing(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
