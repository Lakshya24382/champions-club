import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

export default function Pos() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({}); // productId -> { product, qty }
  const [memberSearch, setMemberSearch] = useState('');
  const [member, setMember] = useState(null);
  const [walkInName, setWalkInName] = useState('');
  const [payment, setPayment] = useState('cash');
  const [done, setDone] = useState(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products', search, 'pos'],
    queryFn: () => api(`/products?search=${encodeURIComponent(search)}`),
    placeholderData: (prev) => prev,
  });
  const { data: found = [] } = useQuery({
    queryKey: ['member-search', memberSearch],
    queryFn: () => api(`/members?search=${encodeURIComponent(memberSearch)}&limit=5`),
    enabled: !member && memberSearch.length >= 2,
  });
  const { data: detail } = useQuery({
    queryKey: ['member', member?.id, 'pos'],
    queryFn: () => api(`/members/${member.id}`),
    enabled: !!member,
  });

  const lines = Object.values(cart);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const discountOk = detail && ['active', 'expiring'].includes(detail.membership_status);
  const pct = discountOk ? detail.shop_discount_pct : 0;
  const discount = Math.round(subtotal * pct) / 100;
  const total = subtotal - discount;

  const add = (p) => setCart((c) => {
    const qty = (c[p.id]?.qty ?? 0) + 1;
    return qty > p.stock_qty ? c : { ...c, [p.id]: { product: p, qty } };
  });
  const setQty = (id, qty) => setCart((c) => {
    if (qty <= 0) { const { [id]: _removed, ...rest } = c; return rest; }
    return { ...c, [id]: { ...c[id], qty: Math.min(qty, c[id].product.stock_qty) } };
  });

  const checkout = useMutation({
    mutationFn: () => api('/orders', {
      method: 'POST',
      body: {
        memberId: member?.id ?? null,
        customerName: member ? null : walkInName || null,
        paymentMethod: payment,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
      },
    }),
    onSuccess: (order) => {
      setDone(order);
      setCart({}); setMember(null); setMemberSearch(''); setWalkInName('');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <h1 className="text-2xl font-bold">Point of sale</h1>
        <input className={inputCls} placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {products.map((p) => (
            <button key={p.id} disabled={p.stock_qty === 0} onClick={() => add(p)}
                    className="rounded-xl border bg-white p-3 text-left hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
              <p className="text-xs text-slate-500">{p.category_name}</p>
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-sm">{money(p.price)}</p>
              <p className={`text-xs ${p.is_low ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                {p.stock_qty === 0 ? 'Out of stock' : `${p.stock_qty} in stock`}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-4 lg:self-start">
        <h2 className="font-semibold">Current sale</h2>

        {done && (
          <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
            ✔ {done.order_no} · {money(done.total)} paid by {done.payment_method}
            {done.discount_pct > 0 && ` (saved ${money(done.discount_amount)})`}
          </p>
        )}

        {member ? (
          <div className="rounded-lg bg-slate-50 p-2 text-sm">
            <b>{member.full_name}</b> · {member.plan_name} · {member.membership_status}
            <br />
            {discountOk ? <span className="text-emerald-700">{pct}% shop discount applied</span>
              : detail && <span className="text-red-600">Membership not valid: no discount</span>}
            <button className="ml-2 text-xs text-slate-500 underline" onClick={() => setMember(null)}>change</button>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Member (optional): name, phone or code">
              <input className={inputCls} value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
            </Field>
            {found.map((r) => (
              <button key={r.id} className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50" onClick={() => setMember(r)}>
                {r.full_name} <span className="text-slate-500">· {r.member_code} · {r.plan_name}</span>
              </button>
            ))}
            <Field label="…or walk-in name (optional)">
              <input className={inputCls} value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
            </Field>
          </div>
        )}

        <ul className="divide-y text-sm">
          {lines.length === 0 && <li className="py-2 text-slate-500">Tap products to add them.</li>}
          {lines.map((l) => (
            <li key={l.product.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex-1">{l.product.name}<br /><span className="text-xs text-slate-500">{money(l.product.price)} each</span></span>
              <span className="flex items-center gap-1">
                <button className={btnGhostCls} onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                <span className="w-6 text-center">{l.qty}</span>
                <button className={btnGhostCls} onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
              </span>
              <span className="w-20 text-right">{money(l.product.price * l.qty)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {pct > 0 && <div className="flex justify-between text-emerald-700"><span>Member discount ({pct}%)</span><span>−{money(discount)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="flex gap-2">
          {['cash', 'card', 'upi'].map((m) => (
            <button key={m} className={`flex-1 uppercase ${payment === m ? btnCls : btnGhostCls}`} onClick={() => setPayment(m)}>{m}</button>
          ))}
        </div>

        {checkout.error && <p className="text-sm text-red-600">{checkout.error.message}</p>}
        <button className={`${btnCls} w-full`} disabled={lines.length === 0 || checkout.isPending} onClick={() => checkout.mutate()}>
          Complete sale · {money(total)}
        </button>
      </div>
    </div>
  );
}
