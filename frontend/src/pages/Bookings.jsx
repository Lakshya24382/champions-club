import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

const SLOT_STYLE = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  social: 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100',
  full: 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700',
  booked: 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through',
  past: 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300',
};

function BookingModal({ court, slot, date, onClose }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState('member');
  const [search, setSearch] = useState('');
  const [member, setMember] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const social = slot.state === 'social';

  const { data: results = [] } = useQuery({
    queryKey: ['member-search', search],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}&limit=5`),
    enabled: mode === 'member' && search.length >= 2,
  });

  const book = useMutation({
    mutationFn: () => api('/bookings', {
      method: 'POST',
      body: {
        courtId: court.id, date, time: slot.time,
        memberId: mode === 'member' ? member?.id : null,
        guestName: mode === 'walkin' ? guestName : null,
        guestPhone: mode === 'walkin' ? guestPhone || null : null,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', date] });
      qc.invalidateQueries({ queryKey: ['bookings', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const canSubmit = mode === 'member' ? !!member : guestName.trim().length >= 2;

  return (
    <Modal title={`${court.name} · ${date} · ${slot.time}`} onClose={onClose}>
      <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
        {social
          ? `🎉 Friday social play: shared court, ${slot.spotsLeft} spots left, ${money(court.social_price_per_person)} per person (before plan discount).`
          : `1-hour session · walk-in rate ${money(court.price_per_hour)}. Members get their plan discount automatically.`}
      </p>

      <div className="mb-3 flex gap-2">
        <button className={mode === 'member' ? btnCls : btnGhostCls} onClick={() => setMode('member')}>Member</button>
        <button className={mode === 'walkin' ? btnCls : btnGhostCls} onClick={() => setMode('walkin')}>Walk-in</button>
      </div>

      {mode === 'member' ? (
        <div className="space-y-2">
          <Field label="Find member (name, phone or code)">
            <input className={inputCls} value={search} onChange={(e) => { setSearch(e.target.value); setMember(null); }} />
          </Field>
          {member ? (
            <p className="rounded-lg bg-emerald-50 p-2 text-sm">✔ {member.full_name} · {member.plan_name} · {member.membership_status}</p>
          ) : (
            results.map((r) => (
              <button key={r.id} className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50" onClick={() => setMember(r)}>
                {r.full_name} <span className="text-slate-500">· {r.member_code} · {r.plan_name} · {r.membership_status}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={inputCls} value={guestName} onChange={(e) => setGuestName(e.target.value)} /></Field>
          <Field label="Phone (optional)"><input className={inputCls} value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} /></Field>
        </div>
      )}

      {book.error && <p className="mt-3 text-sm text-red-600">{book.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhostCls} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={!canSubmit || book.isPending} onClick={() => book.mutate()}>Confirm booking</button>
      </div>
    </Modal>
  );
}

export default function Bookings() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [picked, setPicked] = useState(null); // { court, slot }

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ['availability', date],
    queryFn: () => api(`/bookings/availability?date=${date}`),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', date],
    queryFn: () => api(`/bookings?date=${date}`),
  });

  const cancel = useMutation({
    mutationFn: (id) => api(`/bookings/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', date] });
      qc.invalidateQueries({ queryKey: ['bookings', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Court bookings</h1>
        <input type="date" className={`${inputCls} max-w-[11rem]`} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1">Available</span>
        <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1">Social play (shared)</span>
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1">Social full</span>
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1">Booked</span>
      </div>

      {isLoading && <p>Loading availability…</p>}
      {courts.map((court) => (
        <div key={court.id} className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold">{court.name} <span className="text-sm font-normal text-slate-500">· {court.sport} · {money(court.price_per_hour)}/hr</span></h2>
          <div className="flex flex-wrap gap-1.5">
            {court.slots.map((s) => {
              const clickable = s.state === 'available' || s.state === 'social';
              return (
                <button key={s.time} disabled={!clickable}
                        onClick={() => setPicked({ court, slot: s })}
                        className={`rounded border px-2 py-1 text-xs ${SLOT_STYLE[s.state]}`}
                        title={s.state === 'social' ? `${s.spotsLeft} spots left` : s.state}>
                  {s.time}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Bookings on {date}</h2>
        {bookings.length === 0 && <p className="text-sm text-slate-500">Nothing booked yet.</p>}
        <ul className="divide-y text-sm">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <span className={b.status === 'cancelled' ? 'text-slate-400 line-through' : ''}>
                <b>{b.start_time}–{b.end_time}</b> · {b.court_name} · {b.player}
                {b.member_code ? ` (${b.member_code})` : ' (walk-in)'}
                {b.kind === 'social' && ' · social'}
              </span>
              <span className="flex items-center gap-3">
                {money(b.price)}
                {b.status === 'confirmed' && (
                  <button className="text-red-600 hover:underline" onClick={() => cancel.mutate(b.id)}>Cancel</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {cancel.error && <p className="mt-2 text-sm text-red-600">{cancel.error.message}</p>}
      </div>

      {picked && <BookingModal {...picked} date={date} onClose={() => setPicked(null)} />}
    </div>
  );
}
