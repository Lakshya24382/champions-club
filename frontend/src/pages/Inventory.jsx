import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, Field, inputCls, btnCls, btnGhostCls, money } from '../components/ui.jsx';

function ProductModal({ onClose }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({ queryKey: ['categories'], queryFn: () => api('/products/categories') });
  const [f, setF] = useState({ sku: '', name: '', categoryId: '', price: '', stockQty: '0', lowStockThreshold: '5', description: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api('/products', {
      method: 'POST',
      body: {
        sku: f.sku, name: f.name, categoryId: Number(f.categoryId),
        price: Number(f.price), stockQty: Number(f.stockQty),
        lowStockThreshold: Number(f.lowStockThreshold),
        description: f.description || null,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  return (
    <Modal title="New product" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU"><input required className={inputCls} value={f.sku} onChange={set('sku')} /></Field>
          <Field label="Category">
            <select required className={inputCls} value={f.categoryId} onChange={set('categoryId')}>
              <option value="">Select…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Name"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Description (optional)"><input className={inputCls} value={f.description} onChange={set('description')} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Price (₹)"><input required type="number" min="0" step="0.01" className={inputCls} value={f.price} onChange={set('price')} /></Field>
          <Field label="Opening stock"><input type="number" min="0" className={inputCls} value={f.stockQty} onChange={set('stockQty')} /></Field>
          <Field label="Low-stock alert at"><input type="number" min="0" className={inputCls} value={f.lowStockThreshold} onChange={set('lowStockThreshold')} /></Field>
        </div>
        {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={create.isPending}>Add product</button>
        </div>
      </form>
    </Modal>
  );
}

function RestockModal({ product, onClose }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState('10');
  const [note, setNote] = useState('');
  const restock = useMutation({
    mutationFn: () => api(`/products/${product.id}/restock`, {
      method: 'POST', body: { qty: Number(qty), note: note || null },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  return (
    <Modal title={`Adjust stock · ${product.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Currently <b>{product.stock_qty}</b> in stock. Enter a positive number for a delivery or a negative number
        for damaged or lost items. Every change is recorded.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Change"><input type="number" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {restock.error && <p className="mt-3 text-sm text-red-600">{restock.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnGhostCls} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={restock.isPending || !Number(qty)} onClick={() => restock.mutate()}>Save</button>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [restocking, setRestocking] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, lowOnly ? 'low' : 'all'],
    queryFn: () => api(`/products?search=${encodeURIComponent(search)}${lowOnly ? '&lowStock=1' : ''}`),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <button className={btnCls} onClick={() => setAdding(true)}>+ New product</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Search name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">SKU</th><th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">In stock</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={6}>Loading…</td></tr>}
            {products.map((p) => (
              <tr key={p.id} className={`border-t ${p.is_low ? 'bg-red-50' : ''}`}>
                <td className="p-3 font-mono text-xs">{p.sku}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.category_name}</td>
                <td className="p-3">{money(p.price)}</td>
                <td className="p-3">
                  <span className="font-semibold">{p.stock_qty}</span>
                  {p.is_low && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{p.stock_qty === 0 ? 'out of stock' : 'low'}</span>}
                </td>
                <td className="p-3 text-right">
                  <button className="text-emerald-700 hover:underline" onClick={() => setRestocking(p)}>Adjust stock</button>
                </td>
              </tr>
            ))}
            {!isLoading && products.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No products found.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Adding products and adjusting stock needs an owner or admin login. The front desk can sell but not edit stock.</p>

      {adding && <ProductModal onClose={() => setAdding(false)} />}
      {restocking && <RestockModal product={restocking} onClose={() => setRestocking(null)} />}
    </div>
  );
}
