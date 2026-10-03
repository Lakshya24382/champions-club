import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

const ITEM_BADGE = {
  new: 'bg-slate-100 text-slate-700',
  preparing: 'bg-amber-100 text-amber-800',
  ready: 'bg-sky-100 text-sky-800',
  served: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-600',
};

// One place to refresh everything that a bar action can change.
function useRefreshBar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['bar-orders'] });
    qc.invalidateQueries({ queryKey: ['bar-order'] });
    qc.invalidateQueries({ queryKey: ['bar-kitchen'] });
    qc.invalidateQueries({ queryKey: ['shift'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

function MemberPicker({ onPick }) {
  const [search, setSearch] = useState('');
  const { data: found = [] } = useQuery({
    queryKey: ['member-search', search],
    queryFn: () => api(`/members?search=${encodeURIComponent(search)}&limit=5`),
    enabled: search.length >= 2,
  });
  return (
    <div className="space-y-2">
      <input className={inputCls} placeholder="Search name, phone or CC-00001…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {found.map((r) => (
        <button key={r.id} type="button" className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50" onClick={() => onPick(r)}>
          {r.full_name} <span className="text-slate-500">· {r.member_code} · {r.plan_name} · {r.membership_status}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ shift
function EndShiftModal({ shift, onClose }) {
  const refresh = useRefreshBar();
  const [closing, setClosing] = useState(String(shift.expected_cash));
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);

  const end = useMutation({
    mutationFn: () => api('/bar/shifts/end', { method: 'POST', body: { closingCash: Number(closing), note: note || null } }),
    onSuccess: (r) => { setResult(r); refresh(); },
  });

  if (result) {
    return (
      <Modal title="Shift closed" onClose={onClose}>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Cash sales</dt><dd>{money(result.by_method.cash)}</dd></div>
          <div className="flex justify-between"><dt>Card sales</dt><dd>{money(result.by_method.card)}</dd></div>
          <div className="flex justify-between"><dt>UPI sales</dt><dd>{money(result.by_method.upi)}</dd></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total sales</dt><dd>{money(result.sales_total)}</dd></div>
          <div className="flex justify-between"><dt>Cash expected in drawer</dt><dd>{money(result.expected_cash)}</dd></div>
          <div className="flex justify-between"><dt>Cash counted</dt><dd>{money(result.shift.closing_cash)}</dd></div>
          <div className={`flex justify-between font-semibold ${result.variance === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            <dt>Difference</dt><dd>{result.variance > 0 ? '+' : ''}{money(result.variance)}</dd>
          </div>
        </dl>
        {result.open_tabs > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            {result.open_tabs} tab(s) are still open. The next shift will need to settle them.
          </p>
        )}
        <div className="mt-4 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="End shift" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Sales this shift: <b>{money(shift.sales_total)}</b>. The drawer should hold <b>{money(shift.expected_cash)}</b>{' '}
        (opening float + cash sales). Count it and enter the real amount.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cash counted (₹)"><input type="number" min="0" className={inputCls} value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {end.error && <p className="mt-3 text-sm text-red-600">{end.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhostCls} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={end.isPending || closing === ''} onClick={() => end.mutate()}>Close shift</button>
      </div>
    </Modal>
  );
}

function ShiftBar() {
  const refresh = useRefreshBar();
  const [cash, setCash] = useState('0');
  const [ending, setEnding] = useState(null);   // holds the shift being closed, so the modal survives the refresh
  const { data } = useQuery({ queryKey: ['shift'], queryFn: () => api('/bar/shifts/current'), refetchInterval: 30_000 });
  const start = useMutation({
    mutationFn: () => api('/bar/shifts/start', { method: 'POST', body: { openingCash: Number(cash) || 0 } }),
    onSuccess: refresh,
  });
  const shift = data?.shift;
  if (!data) return null;

  return (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${shift ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        {shift ? (
          <>
            <span>
              🟢 On shift since {new Date(shift.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' · '}sales {money(shift.sales_total)}{' · '}cash in drawer should be {money(shift.expected_cash)}
            </span>
            <button className={btnGhostCls} onClick={() => setEnding(shift)}>End shift</button>
          </>
        ) : (
          <>
            <span>⚠️ You are not on shift. Start one to open tabs and take payments.</span>
            <span className="flex items-center gap-2">
              <input type="number" min="0" className={`${inputCls} w-32`} value={cash} onChange={(e) => setCash(e.target.value)} />
              <button className={btnCls} disabled={start.isPending} onClick={() => start.mutate()}>Start shift (opening cash ₹)</button>
            </span>
          </>
        )}
      </div>
      {start.error && <p className="text-sm text-red-600">{start.error.message}</p>}
      {ending && <EndShiftModal shift={ending} onClose={() => setEnding(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ opening a tab
function NewTabModal({ table, onClose, onCreated }) {
  const refresh = useRefreshBar();
  const [member, setMember] = useState(null);
  const [guest, setGuest] = useState('');

  const create = useMutation({
    mutationFn: () => api('/bar/orders', {
      method: 'POST',
      body: { tableId: table?.id ?? null, memberId: member?.id ?? null, customerName: guest || null },
    }),
    onSuccess: (o) => { refresh(); onCreated(o.id); },
  });

  return (
    <Modal title={table ? `Open tab · ${table.name}` : 'Open counter / takeaway tab'} onClose={onClose}>
      <div className="space-y-3">
        {member ? (
          <p className="rounded-lg bg-emerald-50 p-2 text-sm">
            ✔ {member.full_name} · {member.plan_name} · {member.membership_status}
            <button className="ml-2 text-xs text-slate-500 underline" onClick={() => setMember(null)}>change</button>
          </p>
        ) : (
          <Field label="Member (optional): their bar discount applies automatically">
            <MemberPicker onPick={setMember} />
          </Field>
        )}
        {!member && (
          <Field label="…or guest name (optional)">
            <input className={inputCls} value={guest} onChange={(e) => setGuest(e.target.value)} />
          </Field>
        )}
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending} onClick={() => create.mutate()}>Open tab</button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ paying
function SettleModal({ order, onClose }) {
  const refresh = useRefreshBar();
  const [lines, setLines] = useState([{ method: 'cash', amount: String(order.total) }]);
  const paid = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const remaining = Math.round((order.total - paid) * 100) / 100;
  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const pay = useMutation({
    mutationFn: () => api(`/bar/orders/${order.id}/settle`, {
      method: 'POST',
      body: { payments: lines.map((l) => ({ method: l.method, amount: Number(l.amount) })) },
    }),
    onSuccess: () => { refresh(); onClose(); },
  });

  const valid = remaining === 0 && lines.every((l) => Number(l.amount) > 0);

  return (
    <Modal title={`Settle ${order.order_no}`} onClose={onClose}>
      <div className="mb-3 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
        {order.discount_pct > 0 && (
          <div className="flex justify-between text-emerald-700"><span>Member discount ({order.discount_pct}%)</span><span>−{money(order.discount_amount)}</span></div>
        )}
        <div className="flex justify-between text-lg font-bold"><span>Bill</span><span>{money(order.total)}</span></div>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className={`${inputCls} max-w-[7rem]`} value={l.method} onChange={(e) => setLine(i, { method: e.target.value })}>
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
            </select>
            <input type="number" min="0" step="0.01" className={inputCls} value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
            {lines.length > 1 && (
              <button className="text-red-600" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>✕</button>
            )}
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm text-emerald-700 hover:underline"
              onClick={() => setLines((ls) => [...ls, { method: 'upi', amount: remaining > 0 ? String(remaining) : '0' }])}>
        + Split payment
      </button>

      <p className={`mt-3 text-sm ${remaining === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
        {remaining === 0 ? 'Payments match the bill ✔' : remaining > 0 ? `${money(remaining)} still to collect` : `${money(-remaining)} too much`}
      </p>
      {pay.error && <p className="mt-2 text-sm text-red-600">{pay.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhostCls} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={!valid || pay.isPending} onClick={() => pay.mutate()}>Confirm payment</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ the selected tab
function TabPanel({ orderId, onClose }) {
  const refresh = useRefreshBar();
  const [cat, setCat] = useState('All');
  const [settling, setSettling] = useState(false);

  const { data: order } = useQuery({
    queryKey: ['bar-order', orderId],
    queryFn: () => api(`/bar/orders/${orderId}`),
    refetchInterval: 8000,       // see when the kitchen marks things ready
  });
  const { data: menu = [] } = useQuery({ queryKey: ['bar-menu'], queryFn: () => api('/bar/menu') });

  const mut = useMutation({
    mutationFn: ({ path, method = 'POST', body }) => api(path, { method, body }),
    onSuccess: refresh,
  });

  if (!order) return <div className="rounded-xl border bg-white p-4">Loading…</div>;
  const open = order.status === 'open';
  const cats = ['All', ...new Set(menu.map((m) => m.category_name))];
  const shown = cat === 'All' ? menu : menu.filter((m) => m.category_name === cat);
  const lines = order.items.filter((i) => i.status !== 'cancelled');

  const addItem = (m) => mut.mutate({ path: `/bar/orders/${orderId}/items`, body: { items: [{ menuItemId: m.id, qty: 1 }] } });
  const voidTab = () => {
    const reason = window.prompt('Reason for voiding this tab?');
    if (reason) mut.mutate({ path: `/bar/orders/${orderId}/void`, body: { reason } }, { onSuccess: onClose });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {order.table_name ?? 'Takeaway'} · {order.order_no}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${open ? 'bg-amber-100 text-amber-800' : order.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{order.status}</span>
          </h2>
          <p className="text-sm text-slate-600">{order.customer_name}</p>
        </div>
        <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
      </div>

      {open && (order.member_id ? (
        <div className="rounded-lg bg-slate-50 p-2 text-sm">
          <b>{order.member_name}</b> ({order.member_code}){' · '}
          {order.discount_pct > 0
            ? <span className="text-emerald-700">{order.discount_pct}% bar discount applied</span>
            : <span className="text-red-600">membership not valid: no discount</span>}
          <button className="ml-2 text-xs text-slate-500 underline"
                  onClick={() => mut.mutate({ path: `/bar/orders/${orderId}`, method: 'PATCH', body: { memberId: null } })}>remove</button>
        </div>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-emerald-700">+ Attach a member for their discount</summary>
          <div className="mt-2">
            <MemberPicker onPick={(r) => mut.mutate({ path: `/bar/orders/${orderId}`, method: 'PATCH', body: { memberId: r.id } })} />
          </div>
        </details>
      ))}

      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button key={c} className={`rounded-full px-3 py-1 text-xs ${cat === c ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {shown.map((m) => (
              <button key={m.id} disabled={!m.is_available} onClick={() => addItem(m)}
                      className="rounded-lg border bg-white p-2 text-left text-sm hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
                <span className="block font-medium">{m.name}</span>
                <span className="text-xs text-slate-500">{money(m.price)}{!m.is_available && ' · sold out'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="divide-y text-sm">
        {order.items.length === 0 && <li className="py-2 text-slate-500">No items yet. Tap the menu to add.</li>}
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2">
            <span className={`flex-1 ${i.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
              {i.qty} × {i.name}
              {i.note && <span className="block text-xs text-slate-500">“{i.note}”</span>}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ITEM_BADGE[i.status]}`}>{i.status}</span>
            <span className="w-20 text-right">{money(i.unit_price * i.qty)}</span>
            {open && i.status === 'ready' && (
              <button className="text-xs text-emerald-700 hover:underline"
                      onClick={() => mut.mutate({ path: `/bar/items/${i.id}/status`, body: { status: 'served' } })}>Served</button>
            )}
            {open && i.status !== 'cancelled' && (
              <button className="text-xs text-red-600 hover:underline"
                      onClick={() => mut.mutate({ path: `/bar/items/${i.id}/cancel` })}>✕</button>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
        {order.discount_pct > 0 && (
          <div className="flex justify-between text-emerald-700"><span>Member discount ({order.discount_pct}%)</span><span>−{money(order.discount_amount)}</span></div>
        )}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(order.total)}</span></div>
      </div>

      {order.status === 'paid' && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
          ✔ Paid: {order.payments.map((p) => `${money(p.amount)} ${p.method}`).join(' + ')}
        </p>
      )}
      {order.status === 'void' && <p className="rounded-lg bg-slate-100 p-2 text-sm">Voided: {order.void_reason}</p>}

      {mut.error && <p className="text-sm text-red-600">{mut.error.message}</p>}

      {open && (
        <div className="flex items-center justify-between gap-2">
          <button className="text-sm text-red-600 hover:underline" onClick={voidTab}>Void tab</button>
          <button className={btnCls} disabled={order.total <= 0} onClick={() => setSettling(true)}>Settle · {money(order.total)}</button>
        </div>
      )}
      {settling && <SettleModal order={order} onClose={() => setSettling(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ the page
export default function Bar() {
  const [selected, setSelected] = useState(null);       // selected order id
  const [newTabFor, setNewTabFor] = useState(undefined); // undefined = closed, null = takeaway, object = table

  const { data: tables = [] } = useQuery({ queryKey: ['bar-tables'], queryFn: () => api('/bar/tables') });
  const { data: orders = [] } = useQuery({
    queryKey: ['bar-orders', 'open'],
    queryFn: () => api('/bar/orders?status=open'),
    refetchInterval: 10_000,
  });

  const takeaway = orders.filter((o) => !o.table_id);
  const activeCount = (o) => o.items.filter((i) => i.status !== 'cancelled').length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bar & cafeteria</h1>
      <ShiftBar />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            {tables.map((t) => {
              const o = orders.find((x) => x.table_id === t.id);
              return (
                <button key={t.id}
                        onClick={() => (o ? setSelected(o.id) : setNewTabFor(t))}
                        className={`rounded-xl border p-3 text-left ${o ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'} ${o && selected === o.id ? 'ring-2 ring-emerald-600' : ''}`}>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.seats} seats</p>
                  {o ? (
                    <p className="mt-1 text-sm">{o.customer_name}<br /><b>{money(o.total)}</b> · {activeCount(o)} items</p>
                  ) : <p className="mt-1 text-sm text-emerald-700">Free</p>}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Counter / takeaway</h3>
              <button className={btnGhostCls} onClick={() => setNewTabFor(null)}>+ New tab</button>
            </div>
            {takeaway.length === 0 && <p className="text-sm text-slate-500">None open.</p>}
            {takeaway.map((o) => (
              <button key={o.id} className="mb-1 block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50" onClick={() => setSelected(o.id)}>
                {o.customer_name} · {o.order_no} · <b>{money(o.total)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selected
            ? <TabPanel key={selected} orderId={selected} onClose={() => setSelected(null)} />
            : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">Select a table to open or continue a tab.</div>}
        </div>
      </div>

      {newTabFor !== undefined && (
        <NewTabModal table={newTabFor} onClose={() => setNewTabFor(undefined)}
                     onCreated={(id) => { setSelected(id); setNewTabFor(undefined); }} />
      )}
    </div>
  );
}
