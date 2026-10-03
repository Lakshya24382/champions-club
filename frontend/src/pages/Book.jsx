import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money, toast } from '../components/ui.jsx';
import { plusDays } from '../components/leadUi.jsx';

const DAYS = Array.from({ length: 7 }, (_, i) => plusDays(i));
const dayLabel = (iso, i) =>
  i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
    : new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

function TrialModal({ court, slot, date, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', phone: '', email: '', website: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [done, setDone] = useState(null);

  const book = useMutation({
    mutationFn: () => api('/public/trial', {
      method: 'POST',
      body: { name: f.name, phone: f.phone, email: f.email || null, courtId: court.id, date, time: slot.time, website: f.website },
    }),
    onSuccess: (r) => { setDone(r); qc.invalidateQueries({ queryKey: ['public-availability'] }); },
    onError: (err) => toast(err.message, 'error'),
  });

  if (done) {
    return (
      <Modal title="You're booked! 🎉" onClose={onClose}>
        <div className="space-y-2 text-sm">
          <p>Your trial session is confirmed.</p>
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
            <b>{done.court}</b><br />{done.date} at {done.time} (1 hour)<br />Reference: <b>{done.reference}</b>
          </p>
          <p className="text-slate-600">Please pay {money(done.price)} at the front desk when you arrive. We'll be in touch to say hello and answer any questions.</p>
        </div>
        <div className="mt-4 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title={`Book a trial · ${court.name}`} onClose={onClose}>
      <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
        {date} at {slot.time} · 1 hour · {money(court.price_per_hour)}, paid at the club.
      </p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); book.mutate(); }}>
        <Field label="Your name"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input required className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email (optional)"><input type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
        </div>
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={set('website')} />
        {book.error && <p className="text-sm text-red-600">{book.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={book.isPending}>Confirm trial</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Book() {
  const [dayIdx, setDayIdx] = useState(0);
  const [sport, setSport] = useState('all');
  const [picked, setPicked] = useState(null);
  const date = DAYS[dayIdx];

  const { data: courts = [], isLoading, error } = useQuery({
    queryKey: ['public-availability', date],
    queryFn: () => api(`/public/availability?date=${date}`),
    refetchInterval: 30_000,
  });

  const sports = ['all', ...new Set(courts.map((c) => c.sport))];
  const shown = sport === 'all' ? courts : courts.filter((c) => c.sport === sport);
  const freeCount = shown.reduce((n, c) => n + c.slots.filter((s) => s.state === 'available').length, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">What's free this week</h1>
        <p className="mt-1 text-slate-600">Pick a day and a green slot to book a one-hour trial session. No account needed.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DAYS.map((d, i) => (
          <button key={d} className={dayIdx === i ? btnCls : btnGhostCls} onClick={() => setDayIdx(i)}>{dayLabel(d, i)}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {sports.map((s) => (
          <button key={s} className={`rounded-full px-3 py-1 capitalize ${sport === s ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`} onClick={() => setSport(s)}>{s}</button>
        ))}
        <span className="ml-2 text-slate-500">{freeCount} free slots</span>
      </div>

      {isLoading && <p>Loading availability…</p>}
      {error && <p className="text-red-600">{error.message}</p>}

      {shown.map((court) => (
        <div key={court.id} className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">{court.name} <span className="text-sm font-normal text-slate-500">· {court.sport} · {money(court.price_per_hour)}/hr</span></h2>
          <div className="flex flex-wrap gap-1.5">
            {court.slots.filter((s) => s.state !== 'past').map((s) => {
              const free = s.state === 'available';
              const style = free
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : s.state === 'social'
                  ? 'cursor-not-allowed border-violet-200 bg-violet-50 text-violet-700'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through';
              return (
                <button key={s.time} disabled={!free} onClick={() => setPicked({ court, slot: s })}
                        title={s.state === 'social' ? 'Friday social play: just turn up' : s.state}
                        className={`rounded border px-2 py-1 text-xs ${style}`}>
                  {s.time}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Free: click to book</span>
        <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1">Friday social play: just turn up</span>
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1">Taken</span>
      </div>
      <p className="text-sm text-slate-500">
        Already a member? Book through the front desk. Want to join? <Link className="text-emerald-700 underline" to="/#plans">See our plans</Link>.
      </p>

      {picked && <TrialModal {...picked} date={date} onClose={() => setPicked(null)} />}
    </div>
  );
}
