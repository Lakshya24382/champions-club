import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { btnCls, btnGhostCls } from '../components/ui.jsx';

const NEXT = { new: ['preparing', 'Start'], preparing: ['ready', 'Mark ready'], ready: ['served', 'Served'] };
const COLS = [
  ['new', 'New', 'border-slate-300'],
  ['preparing', 'Preparing', 'border-amber-300'],
  ['ready', 'Ready to serve', 'border-sky-300'],
];
const ageMin = (ts) => Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));

function SoldOutSwitches() {
  const qc = useQueryClient();
  const { data: menu = [] } = useQuery({ queryKey: ['bar-menu'], queryFn: () => api('/bar/menu') });
  const toggle = useMutation({
    mutationFn: ({ id, isAvailable }) =>
      api(`/bar/menu/items/${id}/availability`, { method: 'POST', body: { isAvailable } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bar-menu'] }),
  });
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-semibold">Sold-out switches</summary>
      <p className="mt-1 text-xs text-slate-500">Untick an item when it runs out. Waiters can't add it to a tab until you tick it again.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        {menu.map((m) => (
          <label key={m.id} className={`flex items-center gap-2 ${m.is_available ? '' : 'text-red-600'}`}>
            <input type="checkbox" checked={m.is_available}
                   onChange={(e) => toggle.mutate({ id: m.id, isAvailable: e.target.checked })} />
            {m.name}
          </label>
        ))}
      </div>
    </details>
  );
}

export default function Kitchen() {
  const qc = useQueryClient();
  const [station, setStation] = useState('kitchen');

  const { data: items = [] } = useQuery({
    queryKey: ['bar-kitchen', station],
    queryFn: () => api(`/bar/kitchen?station=${station}`),
    refetchInterval: 5000,
  });

  const advance = useMutation({
    mutationFn: ({ id, status }) => api(`/bar/items/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar-kitchen'] });
      qc.invalidateQueries({ queryKey: ['bar-order'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kitchen & bar screen</h1>
        <div className="flex gap-2">
          {[['kitchen', 'Kitchen'], ['bar', 'Bar'], ['', 'Everything']].map(([v, label]) => (
            <button key={label} className={station === v ? btnCls : btnGhostCls} onClick={() => setStation(v)}>{label}</button>
          ))}
        </div>
      </div>
      {advance.error && <p className="text-sm text-red-600">{advance.error.message}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map(([status, title, border]) => {
          const col = items.filter((i) => i.status === status);
          return (
            <div key={status} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-slate-500">{title} ({col.length})</h2>
              {col.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-slate-400">Nothing here.</p>}
              {col.map((i) => (
                <div key={i.id} className={`rounded-xl border-2 bg-white p-3 ${border}`}>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">{i.table_name}</span>
                    <span className={ageMin(i.created_at) >= 10 ? 'font-semibold text-red-600' : ''}>{ageMin(i.created_at)} min</span>
                  </div>
                  <p className="mt-1 text-lg font-bold">{i.qty} × {i.item_name}</p>
                  {i.note && <p className="text-sm font-medium text-amber-700">“{i.note}”</p>}
                  <p className="text-xs text-slate-500">{i.customer_name} · {i.order_no}</p>
                  <button className={`${btnCls} mt-2 w-full`} disabled={advance.isPending}
                          onClick={() => advance.mutate({ id: i.id, status: NEXT[i.status][0] })}>
                    {NEXT[i.status][1]}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <SoldOutSwitches />
    </div>
  );
}
