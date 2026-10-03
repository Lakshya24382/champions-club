import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

export default function Storefront() {
  const qc = useQueryClient();
  const [cat, setCat] = useState('All');
  const [cart, setCart] = useState({}); // id -> { p, qty }
  const [placed, setPlaced] = useState(null);
  const [f, setF] = useState({ customerName: '', customerPhone: '', memberCode: '', fulfilment: 'pickup', deliveryAddress: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const { data: products = [], isLoading } = useQuery({ queryKey: ['catalog'], queryFn: () => api('/catalog/products') });
  const cats = ['All', ...new Set(products.map((p) => p.category_name))];
  const shown = cat === 'All' ? products : products.filter((p) => p.category_name === cat);

  const lines = Object.values(cart);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);

  const add = (p) => setCart((c) => ({ ...c, [p.id]: { p, qty: Math.min((c[p.id]?.qty ?? 0) + 1, 10) } }));
  const dec = (id) => setCart((c) => {
    if (c[id].qty <= 1) { const { [id]: _removed, ...rest } = c; return rest; }
    return { ...c, [id]: { ...c[id], qty: c[id].qty - 1 } };
  });

  const order = useMutation({
    mutationFn: () => api('/catalog/orders', {
      method: 'POST',
      body: {
        customerName: f.customerName,
        customerPhone: f.customerPhone,
        memberCode: f.memberCode || null,
        fulfilment: f.fulfilment,
        deliveryAddress: f.fulfilment === 'delivery' ? f.deliveryAddress : null,
        items: lines.map((l) => ({ productId: l.p.id, qty: l.qty })),
      },
    }),
    onSuccess: (o) => { setPlaced(o); setCart({}); qc.invalidateQueries({ queryKey: ['catalog'] }); },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-emerald-700">🏆 Champions Club · Pro Shop</span>
          <Link to="/login" className="text-sm text-slate-500 hover:text-slate-900">Staff login</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c} className={cat === c ? btnCls : btnGhostCls} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          {isLoading && <p>Loading…</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map((p) => (
              <div key={p.id} className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">{p.category_name}</p>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-slate-600">{p.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold">{money(p.price)}</span>
                  {p.in_stock ? (
                    <button className={btnCls} onClick={() => add(p)}>Add</button>
                  ) : <span className="text-sm text-red-600">Out of stock</span>}
                </div>
                {p.few_left && <p className="mt-1 text-xs font-medium text-amber-600">Only a few left</p>}
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-3 rounded-xl border bg-white p-4 lg:self-start">
          <h2 className="font-semibold">Your order</h2>

          {placed && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              ✔ Order <b>{placed.orderNo}</b> received! Total {money(placed.total)}
              {placed.discountPct > 0 && ` (member discount ${placed.discountPct}% applied)`}.
              <br />
              {placed.fulfilment === 'delivery'
                ? 'We will deliver it soon. Pay on delivery.'
                : "We'll have it ready at the club. Pay when you collect."}
            </div>
          )}

          <ul className="divide-y text-sm">
            {lines.length === 0 && <li className="py-2 text-slate-500">Your cart is empty.</li>}
            {lines.map((l) => (
              <li key={l.p.id} className="flex items-center justify-between py-2">
                <span>{l.p.name}</span>
                <span className="flex items-center gap-2">
                  <button className={btnGhostCls} onClick={() => dec(l.p.id)}>−</button>
                  {l.qty}
                  <button className={btnGhostCls} onClick={() => add(l.p)}>+</button>
                  <span className="w-20 text-right">{money(l.p.price * l.qty)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-bold"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <p className="text-xs text-slate-500">Members: enter your code and phone below. Your discount is applied when you confirm.</p>

          {lines.length > 0 && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); order.mutate(); }}>
              <Field label="Your name"><input required className={inputCls} value={f.customerName} onChange={set('customerName')} /></Field>
              <Field label="Phone"><input required className={inputCls} value={f.customerPhone} onChange={set('customerPhone')} /></Field>
              <Field label="Member code (optional, e.g. CC-00002)"><input className={inputCls} value={f.memberCode} onChange={set('memberCode')} /></Field>
              <div className="flex gap-2">
                <button type="button" className={`flex-1 ${f.fulfilment === 'pickup' ? btnCls : btnGhostCls}`} onClick={() => setF({ ...f, fulfilment: 'pickup' })}>Collect at club</button>
                <button type="button" className={`flex-1 ${f.fulfilment === 'delivery' ? btnCls : btnGhostCls}`} onClick={() => setF({ ...f, fulfilment: 'delivery' })}>Deliver to me</button>
              </div>
              {f.fulfilment === 'delivery' && (
                <Field label="Delivery address"><textarea required className={inputCls} rows={2} value={f.deliveryAddress} onChange={set('deliveryAddress')} /></Field>
              )}
              {order.error && <p className="text-sm text-red-600">{order.error.message}</p>}
              <button className={`${btnCls} w-full`} disabled={order.isPending}>Place order</button>
            </form>
          )}
        </aside>
      </main>
    </div>
  );
}
