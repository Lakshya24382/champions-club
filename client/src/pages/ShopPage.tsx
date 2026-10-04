import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from "../components/ui";
import MemberCodeInput from "../components/MemberCodeInput";
import { useMemberBenefit } from "../components/useMemberBenefit";

const CATS = ["", "racket", "ball", "shoes", "accessory", "apparel"];
type Line = { variantId: number; name: string; label: string; price: number; qty: number };

export default function ShopPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [memberCode, setMemberCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [method, setMethod] = useState("cash");
  const [receipt, setReceipt] = useState<any>(null);

  const products = useQuery({
    queryKey: ["shop-products", category, q],
    queryFn: () => api("GET", `/shop/products${qs({ category, q })}`),
    placeholderData: (prev) => prev,
  });
  const benefit = useMemberBenefit(memberCode);

  const add = (p: any, v: any) =>
    setCart((c) => {
      const i = c.findIndex((l) => l.variantId === v.id);
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...c, { variantId: v.id, name: p.name, label: v.label, price: v.price, qty: 1 }];
    });
  const setQty = (id: number, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.variantId !== id) : c.map((l) => (l.variantId === id ? { ...l, qty: Math.min(20, qty) } : l))));

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const pct = benefit.shopPct;
  const discount = Math.round(subtotal * pct) / 100;
  const total = subtotal - discount;
  const codeGiven = memberCode.trim().length > 0;
  const codeBad = codeGiven && !benefit.pending && !benefit.member;

  const checkout = useMutation({
    mutationFn: () =>
      api("POST", "/shop/orders", {
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        paymentMethod: method,
        ...(codeGiven ? { memberCode: memberCode.trim() } : customerName.trim() ? { customerName: customerName.trim() } : {}),
      }),
    onSuccess: (o) => {
      setReceipt(o);
      setCart([]); setMemberCode(""); setCustomerName("");
      qc.invalidateQueries({ queryKey: ["shop-products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <>
      <PageHeader title="Pro shop" subtitle="Counter sales. Stock leaves the same shelf the online orders use." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-52 flex-1">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <Input className="pl-9" placeholder="Search products or brands" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={cn("rounded-full px-3 py-1 text-sm capitalize", category === c ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{c || "All"}</button>
            ))}
          </div>

          {products.isLoading ? <Spinner /> : products.error ? <ErrorBox error={products.error} /> : !products.data.length ? <Empty>No products found.</Empty> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.data.map((p: any) => (
                <Card key={p.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.brand ?? "-"}</div>
                    </div>
                    <Badge tone="slate">{p.category}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.variants.map((v: any) => (
                      <button
                        key={v.id} disabled={!v.inStock} onClick={() => add(p, v)}
                        className={cn("rounded-lg border px-2.5 py-1.5 text-left text-xs", v.inStock ? "border-slate-300 hover:border-brand-500 hover:bg-brand-50" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through")}
                      >
                        <div className="font-medium">{v.label}</div>
                        <div>{inr(v.price)}{v.lowStock && <span className="ml-1 text-amber-600">low</span>}</div>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <h2 className="mb-3 font-medium text-slate-900">Current sale</h2>
          {!cart.length ? <p className="py-6 text-center text-sm text-slate-400">Tap a size or variant to add it.</p> : (
            <ul className="divide-y divide-slate-100">
              {cart.map((l) => (
                <li key={l.variantId} className="py-2 text-sm">
                  <div className="flex justify-between"><span className="font-medium">{l.name}</span><span>{inr(l.price * l.qty)}</span></div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{l.label} - {inr(l.price)} each</span>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setQty(l.variantId, l.qty - 1)}><Minus size={12} /></Button>
                      <span className="w-6 text-center text-sm text-slate-800">{l.qty}</span>
                      <Button size="sm" variant="secondary" onClick={() => setQty(l.variantId, l.qty + 1)}><Plus size={12} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setQty(l.variantId, 0)}><Trash2 size={12} /></Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Member code (optional)" hint="Members get their shop discount automatically.">
              <MemberCodeInput value={memberCode} onChange={setMemberCode} />
            </Field>
            {!codeGiven && <Field label="Customer name (optional)"><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" /></Field>}
            <Field label="Payment"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option></Select></Field>
          </div>

          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
            {pct > 0 && <div className="flex justify-between text-emerald-600"><span>Member discount ({pct}%)</span><span>-{inr(discount)}</span></div>}
            <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>{inr(total)}</span></div>
          </div>
          <Button className="mt-4 w-full" disabled={!cart.length || codeBad} loading={checkout.isPending} onClick={() => checkout.mutate()}>Take payment</Button>
          {codeBad && <p className="mt-2 text-xs text-red-600">Fix or clear the member code first.</p>}
        </Card>
      </div>

      {receipt && (
        <Modal title="Sale complete" onClose={() => setReceipt(null)}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><b>{receipt.orderNumber}</b><Badge tone="green">paid by {receipt.paymentMethod}</Badge></div>
            <div className="text-slate-500">{receipt.customerName}</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {receipt.items.map((i: any) => (
                <li key={i.variantId} className="flex justify-between px-3 py-2"><span>{i.productName} ({i.variantLabel}) x {i.quantity}</span><span>{inr(i.lineTotal)}</span></li>
              ))}
            </ul>
            {receipt.discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount ({receipt.discountPct}%)</span><span>-{inr(receipt.discountAmount)}</span></div>}
            <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>{inr(receipt.total)}</span></div>
            <div className="flex justify-end"><Button onClick={() => setReceipt(null)}>New sale</Button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
