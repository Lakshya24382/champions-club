import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { inputCls, btnCls, money } from '../components/ui.jsx';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  ready: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

function OrderCard({ o }) {
  const qc = useQueryClient();
  const [pay, setPay] = useState('cash');
  const act = useMutation({
    mutationFn: (body) => api(`/orders/${o.id}/status`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const open = o.status === 'pending' || o.status === 'ready';

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {o.order_no} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status]}`}>{o.status}</span>
          </p>
          <p className="text-sm text-slate-600">
            {o.customer_name}{o.member_code && ` (${o.member_code})`}{o.customer_phone && ` · ${o.customer_phone}`}
          </p>
          <p className="text-xs text-slate-500">
            {o.channel === 'counter' ? 'Counter sale' : o.fulfilment === 'delivery' ? `Delivery to ${o.delivery_address}` : 'Click & collect'}
            {' · '}{new Date(o.created_at).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{money(o.total)}</p>
          {o.discount_pct > 0 && <p className="text-xs text-emerald-700">{o.discount_pct}% member discount</p>}
          {o.payment_method && <p className="text-xs uppercase text-slate-500">paid · {o.payment_method}</p>}
        </div>
      </div>

      <ul className="mt-2 text-sm text-slate-700">
        {o.items.map((i, idx) => <li key={idx}>{i.qty} × {i.name}</li>)}
      </ul>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {o.status === 'pending' && (
            <button className={btnCls} disabled={act.isPending} onClick={() => act.mutate({ status: 'ready' })}>
              Mark ready for {o.fulfilment === 'delivery' ? 'delivery' : 'pickup'}
            </button>
          )}
          <select className={`${inputCls} max-w-[7rem]`} value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
          </select>
          <button className={btnCls} disabled={act.isPending} onClick={() => act.mutate({ status: 'completed', paymentMethod: pay })}>
            {o.fulfilment === 'delivery' ? 'Delivered & paid' : 'Collected & paid'}
          </button>
          <button className="text-sm text-red-600 hover:underline" disabled={act.isPending} onClick={() => act.mutate({ status: 'cancelled' })}>
            Cancel (restock)
          </button>
        </div>
      )}
      {act.error && <p className="mt-2 text-sm text-red-600">{act.error.message}</p>}
    </div>
  );
}

export default function Orders() {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('online');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', status, channel],
    queryFn: () => api(`/orders?status=${status}&channel=${channel}`),
    refetchInterval: 15_000, // new online orders appear without a page refresh
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex gap-3">
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="online">Online orders</option>
            <option value="counter">Counter sales</option>
            <option value="">All</option>
          </select>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      {isLoading && <p>Loading…</p>}
      {!isLoading && orders.length === 0 && <p className="text-sm text-slate-500">No orders here.</p>}
      <div className="space-y-3">{orders.map((o) => <OrderCard key={o.id} o={o} />)}</div>
    </div>
  );
}
