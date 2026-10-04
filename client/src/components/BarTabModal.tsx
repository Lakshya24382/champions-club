import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, fmtTime, inr } from "../lib/format";
import { Badge, Button, Field, Input, Modal, Select, Spinner } from "./ui";

const ITEM_TONE: Record<string, "amber" | "blue" | "green" | "slate" | "red"> = { new: "amber", preparing: "blue", ready: "green", served: "slate", cancelled: "red" };
const CATS = ["", "drink", "food", "snack", "dessert"];
type Pay = { method: string; amount: string };
type RoundLine = { id: number; name: string; price: number; qty: number; notes: string };

export default function BarTabModal({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: () => void }) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [cat, setCat] = useState("");
  const [round, setRound] = useState<RoundLine[]>([]);
  const [pays, setPays] = useState<Pay[]>([{ method: "cash", amount: "" }]);

  const tab = useQuery({ queryKey: ["bar-tab", id], queryFn: () => api("GET", `/bar/tabs/${id}`), refetchInterval: 10_000 });
  const menu = useQuery({ queryKey: ["bar-menu"], queryFn: () => api("GET", "/bar/menu") });
  const shift = useQuery({ queryKey: ["shift"], queryFn: () => api("GET", "/bar/shifts/current") });

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["bar-tab", id] });
    qc.invalidateQueries({ queryKey: ["bar-queue"] });
    onDone();
  };

  const send = useMutation({
    mutationFn: () => api("POST", `/bar/tabs/${id}/items`, {
      items: round.map((r) => ({ menuItemId: r.id, quantity: r.qty, ...(r.notes.trim() ? { notes: r.notes.trim() } : {}) })),
    }),
    onSuccess: () => { toast.success("Sent to the bar and kitchen"); setRound([]); reload(); },
  });
  const cancelItem = useMutation({ mutationFn: (itemId: number) => api("POST", `/bar/items/${itemId}/cancel`, {}), onSuccess: reload });
  const serve = useMutation({ mutationFn: (itemId: number) => api("PATCH", `/bar/items/${itemId}/status`, { status: "served" }), onSuccess: reload });
  const pay = useMutation({
    mutationFn: (payments: { method: string; amount: number }[]) => api("POST", `/bar/tabs/${id}/pay`, { payments }),
    onSuccess: () => { toast.success("Tab paid"); qc.invalidateQueries({ queryKey: ["dashboard"] }); onDone(); onClose(); },
  });
  const voidTab = useMutation({
    mutationFn: (reason: string) => api("POST", `/bar/tabs/${id}/void`, { reason }),
    onSuccess: () => { toast.success("Tab voided"); onDone(); onClose(); },
  });

  const t = tab.data;
  const open = t?.status === "open";
  const addToRound = (m: any) =>
    setRound((r) => {
      const i = r.findIndex((x) => x.id === m.id);
      if (i >= 0) return r.map((x, k) => (k === i ? { ...x, qty: Math.min(20, x.qty + 1) } : x));
      return [...r, { id: m.id, name: m.name, price: m.price, qty: 1, notes: "" }];
    });
  const bump = (mid: number, d: number) => setRound((r) => r.map((x) => (x.id === mid ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0));

  // Payment rows. A single empty row means "the whole bill".
  const total: number = t?.total ?? 0;
  const rows = pays.length === 1 && pays[0].amount === "" ? [{ method: pays[0].method, amount: total }] : pays.map((p) => ({ method: p.method, amount: Number(p.amount) }));
  const paidCents = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0);
  const diff = Math.round(total * 100) - paidCents;
  const canPay = open && total > 0 && diff === 0 && rows.every((r) => r.amount > 0) && Boolean(shift.data);
  const live = t?.items.filter((i: any) => i.status !== "cancelled") ?? [];

  return (
    <Modal title={t ? `${t.tabNumber} - ${t.tableName ?? t.customerName}` : "Tab"} onClose={onClose} wide>
      {tab.isLoading || !t ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={t.status === "open" ? "green" : t.status === "paid" ? "slate" : "red"}>{t.status}</Badge>
            <span className="font-medium">{t.customerName}</span>
            {t.memberCode && <span className="font-mono text-xs text-slate-400">{t.memberCode}</span>}
            {t.discountPct > 0 && <Badge tone="purple">{t.discountPct}% member discount</Badge>}
          </div>

          {open && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex flex-wrap gap-2">
                {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1 text-xs capitalize", cat === c ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>{c || "All"}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {menu.data?.filter((m: any) => !cat || m.category === cat).map((m: any) => (
                  <button key={m.id} disabled={!m.isAvailable} onClick={() => addToRound(m)} className={cn("rounded-lg border px-3 py-2 text-left text-sm", m.isAvailable ? "border-slate-200 hover:border-brand-500 hover:bg-brand-50" : "cursor-not-allowed bg-slate-50 text-slate-400")}>
                    <div className="font-medium">{m.name}</div><div className="text-xs text-slate-500">{inr(m.price)} - {m.station}{!m.isAvailable && " - sold out"}</div>
                  </button>
                ))}
              </div>

              {round.length > 0 && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">New round</div>
                  {round.map((r) => (
                    <div key={r.id} className="mb-2 flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium">{r.name}</span>
                      <Input className="w-40" placeholder="Notes (no sugar...)" value={r.notes} onChange={(e) => setRound((x) => x.map((y) => (y.id === r.id ? { ...y, notes: e.target.value } : y)))} />
                      <Button size="sm" variant="secondary" onClick={() => bump(r.id, -1)}><Minus size={12} /></Button>
                      <span className="w-5 text-center">{r.qty}</span>
                      <Button size="sm" variant="secondary" onClick={() => bump(r.id, 1)}><Plus size={12} /></Button>
                      <span className="w-20 text-right">{inr(r.price * r.qty)}</span>
                    </div>
                  ))}
                  <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setRound([])}>Clear</Button><Button size="sm" loading={send.isPending} onClick={() => send.mutate()}>Send order</Button></div>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium">On this tab</h3>
            {!t.items.length ? <p className="text-sm text-slate-400">Nothing ordered yet.</p> : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {t.items.map((i: any) => (
                  <li key={i.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", i.status === "cancelled" && "opacity-50")}>
                    <span className="flex-1"><span className={cn("font-medium", i.status === "cancelled" && "line-through")}>{i.itemName} x {i.quantity}</span>{i.notes && <span className="ml-2 text-xs text-slate-500">({i.notes})</span>}<span className="ml-2 text-xs text-slate-400">{fmtTime(i.createdAt)}</span></span>
                    <Badge tone={ITEM_TONE[i.status]}>{i.status}</Badge>
                    <span className="w-20 text-right">{inr(i.lineTotal)}</span>
                    {open && i.status === "new" && <Button size="sm" variant="ghost" onClick={() => cancelItem.mutate(i.id)}>Cancel</Button>}
                    {open && i.status === "ready" && <Button size="sm" variant="secondary" onClick={() => serve.mutate(i.id)}>Served</Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(t.subtotal)}</span></div>
            {t.discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Member discount ({t.discountPct}%)</span><span>-{inr(t.discountAmount)}</span></div>}
            <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>{inr(t.total)}</span></div>
          </div>

          {open && live.length > 0 && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-medium">Settle the bill</h3>
              {!shift.isLoading && !shift.data && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Start your shift on the Bar page before taking payments.</p>}
              {pays.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select className="w-28" value={p.method} onChange={(e) => setPays((a) => a.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option></Select>
                  <Input type="number" min={0} step="0.01" placeholder={pays.length === 1 ? String(total) : "Amount"} value={p.amount} onChange={(e) => setPays((a) => a.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  {pays.length > 1 && <Button size="sm" variant="ghost" onClick={() => setPays((a) => a.filter((_, j) => j !== i))}>x</Button>}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPays((a) => [...a.map((x, i) => (i === 0 && x.amount === "" ? { ...x, amount: String(total) } : x)), { method: "upi", amount: "" }])}>Split payment</Button>
                <span className={cn("text-xs", diff === 0 ? "text-emerald-600" : "text-red-600")}>{diff === 0 ? "Payments match the bill" : diff > 0 ? `${inr(diff / 100)} still to allocate` : `${inr(-diff / 100)} too much`}</span>
                <Button disabled={!canPay} loading={pay.isPending} onClick={() => pay.mutate(rows)}>Take payment</Button>
              </div>
            </div>
          )}

          {t.status === "paid" && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Paid: {t.payments.map((p: any) => `${p.method} ${inr(p.amount)}`).join(" + ")}</div>
          )}

          {open && isManager && (
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="danger" size="sm" onClick={() => { const r = prompt("Reason for voiding this tab?"); if (r && r.trim().length >= 3) voidTab.mutate(r.trim()); }}>Void tab</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
