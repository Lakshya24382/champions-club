import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, History, Plus, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn, fmtDateTime, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";

type Dialog = { kind: "restock" | "adjust" | "edit" | "history"; row: any } | { kind: "new" } | null;

export default function InventoryPage() {
  const { isManager } = useAuth();
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const inv = useQuery({ queryKey: ["inventory", lowOnly], queryFn: () => api("GET", `/shop/inventory${qs({ lowOnly })}`) });
  const low = useQuery({ queryKey: ["inventory", true], queryFn: () => api("GET", "/shop/inventory?lowOnly=true") });

  const rows = (inv.data ?? []).filter((r: any) => !q || `${r.product} ${r.sku} ${r.label}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Counter sales and online orders both take from this stock."
        actions={isManager ? <Button onClick={() => setDialog({ kind: "new" })}><Plus size={16} /> New product</Button> : undefined}
      />

      {low.data?.length > 0 && !lowOnly && (
        <button onClick={() => setLowOnly(true)} className="mb-4 flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800">
          <AlertTriangle size={16} /> {low.data.length} item(s) at or below their low-stock level. Click to show only these.
        </button>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <Input className="pl-9" placeholder="Search product, SKU or size" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
          </label>
        </div>

        {inv.isLoading ? <Spinner /> : inv.error ? <ErrorBox error={inv.error} /> : !rows.length ? <Empty>Nothing to show.</Empty> : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Variant</Th><Th>SKU</Th><Th right>Price</Th><Th right>Stock</Th><Th right>Alert at</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r: any) => {
                const out = r.stock === 0;
                const isLow = r.stock <= r.lowStockThreshold;
                return (
                  <tr key={r.variantId}>
                    <Td><div className="font-medium">{r.product}</div><div className="text-xs capitalize text-slate-400">{r.category}</div></Td>
                    <Td>{r.label}</Td>
                    <Td className="font-mono text-xs">{r.sku}</Td>
                    <Td right>{inr(r.price)}</Td>
                    <Td right><span className={cn("font-semibold", out ? "text-red-600" : isLow ? "text-amber-600" : "text-slate-800")}>{r.stock}</span> {out ? <Badge tone="red">out</Badge> : isLow ? <Badge tone="amber">low</Badge> : null}</Td>
                    <Td right>{r.lowStockThreshold}</Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Movement history" onClick={() => setDialog({ kind: "history", row: r })}><History size={14} /></Button>
                        {isManager && <>
                          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "restock", row: r })}>Restock</Button>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "adjust", row: r })}>Adjust</Button>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "edit", row: r })}>Edit</Button>
                        </>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {dialog?.kind === "restock" && <StockModal mode="restock" row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "adjust" && <StockModal mode="adjust" row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <EditModal row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "history" && <HistoryModal row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === "new" && <NewProductModal onClose={() => setDialog(null)} />}
    </>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["shop-products"] });
  };
}

// restock = add received goods; adjust = signed correction (damaged, lost, miscounted)
function StockModal({ mode, row, onClose }: { mode: "restock" | "adjust"; row: any; onClose: () => void }) {
  const refresh = useRefresh();
  const [n, setN] = useState(mode === "restock" ? 10 : -1);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => mode === "restock"
      ? api("POST", `/shop/variants/${row.variantId}/restock`, { quantity: n, ...(note.trim() ? { note: note.trim() } : {}) })
      : api("POST", `/shop/variants/${row.variantId}/adjust`, { change: n, note: note.trim() }),
    onSuccess: (v) => { toast.success(`${row.product} (${row.label}) now has ${v.stock} in stock`); refresh(); onClose(); },
  });
  return (
    <Modal title={`${mode === "restock" ? "Restock" : "Adjust stock"}: ${row.product} (${row.label})`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {mode === "restock" ? "Add units that have arrived from a supplier." : "Use a negative number for damaged or lost items, positive for a recount that found extras."} Currently <b>{row.stock}</b> in stock.
        </p>
        <Field label={mode === "restock" ? "Units received" : "Change (+/-)"}><Input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
        <Field label={mode === "restock" ? "Note (optional)" : "Reason (required)"}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "restock" ? "Supplier invoice 1042" : "Two rackets damaged in storage"} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!n || (mode === "adjust" && note.trim().length < 3) || (mode === "restock" && n < 1)} onClick={() => save.mutate()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ row, onClose }: { row: any; onClose: () => void }) {
  const refresh = useRefresh();
  const [f, setF] = useState({ label: row.label, price: row.price, lowStockThreshold: row.lowStockThreshold });
  const save = useMutation({
    mutationFn: (body: any) => api("PATCH", `/shop/variants/${row.variantId}`, body),
    onSuccess: () => { toast.success("Saved"); refresh(); onClose(); },
  });
  return (
    <Modal title={`Edit: ${row.product}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Variant label"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (INR)"><Input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></Field>
          <Field label="Low-stock alert at"><Input type="number" min={0} value={f.lowStockThreshold} onChange={(e) => setF({ ...f, lowStockThreshold: Number(e.target.value) })} /></Field>
        </div>
        <p className="text-xs text-slate-400">Old orders keep the price they were sold at.</p>
        <div className="flex justify-between">
          <Button variant="danger" size="sm" onClick={() => confirm("Remove this variant from sale?") && save.mutate({ isActive: false })}>Remove from sale</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate({ label: f.label.trim(), price: f.price, lowStockThreshold: f.lowStockThreshold })}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ row, onClose }: { row: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["movements", row.variantId], queryFn: () => api("GET", `/shop/inventory/movements${qs({ variantId: row.variantId, limit: 50 })}`) });
  return (
    <Modal title={`Stock history: ${row.product} (${row.label})`} onClose={onClose} wide>
      {isLoading ? <Spinner /> : !data?.length ? <Empty>No movements yet.</Empty> : (
        <Table>
          <thead><tr><Th>When</Th><Th>Reason</Th><Th right>Change</Th><Th>Order</Th><Th>Note</Th></tr></thead>
          <tbody>
            {data.map((m: any) => (
              <tr key={m.id}>
                <Td>{fmtDateTime(m.createdAt)}</Td><Td className="capitalize">{m.reason.replace("_", " ")}</Td>
                <Td right><span className={m.change > 0 ? "text-emerald-600" : "text-red-600"}>{m.change > 0 ? `+${m.change}` : m.change}</span></Td>
                <Td className="font-mono text-xs">{m.orderNumber ?? "-"}</Td><Td>{m.note ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}

function NewProductModal({ onClose }: { onClose: () => void }) {
  const refresh = useRefresh();
  const [p, setP] = useState({ name: "", brand: "", category: "racket", sport: "", description: "" });
  const blank = { sku: "", label: "Standard", price: 0, stock: 0, lowStockThreshold: 5 };
  const [vs, setVs] = useState([{ ...blank }]);
  const setV = (i: number, k: string, v: string | number) => setVs((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const create = useMutation({
    mutationFn: () => api("POST", "/shop/products", {
      name: p.name.trim(), category: p.category,
      ...(p.brand.trim() ? { brand: p.brand.trim() } : {}),
      ...(p.sport ? { sport: p.sport } : {}),
      ...(p.description.trim() ? { description: p.description.trim() } : {}),
      variants: vs.map((v) => ({ ...v, sku: v.sku.trim(), label: v.label.trim() || "Standard" })),
    }),
    onSuccess: () => { toast.success("Product added"); refresh(); onClose(); },
  });
  const valid = p.name.trim().length >= 2 && vs.every((v) => v.sku.trim().length >= 3);

  return (
    <Modal title="New product" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoFocus /></Field>
          <Field label="Brand"><Input value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} /></Field>
          <Field label="Category"><Select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })}>{["racket", "ball", "shoes", "accessory", "apparel"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Sport (optional)"><Select value={p.sport} onChange={(e) => setP({ ...p, sport: e.target.value })}><option value="">Any</option>{["tennis", "cricket", "padel", "badminton"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Description (optional)"><Input value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>

        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">Variants (sizes, colours)</h3><Button size="sm" variant="secondary" onClick={() => setVs((a) => [...a, { ...blank }])}><Plus size={12} /> Add variant</Button></div>
          <div className="space-y-2">
            {vs.map((v, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-3" placeholder="SKU" value={v.sku} onChange={(e) => setV(i, "sku", e.target.value.toUpperCase())} />
                <Input className="col-span-3" placeholder="Label" value={v.label} onChange={(e) => setV(i, "label", e.target.value)} />
                <Input className="col-span-2" type="number" placeholder="Price" value={v.price} onChange={(e) => setV(i, "price", Number(e.target.value))} />
                <Input className="col-span-2" type="number" placeholder="Stock" value={v.stock} onChange={(e) => setV(i, "stock", Number(e.target.value))} />
                <Input className="col-span-1" type="number" placeholder="Alert" value={v.lowStockThreshold} onChange={(e) => setV(i, "lowStockThreshold", Number(e.target.value))} />
                <Button size="sm" variant="ghost" className="col-span-1" disabled={vs.length === 1} onClick={() => setVs((a) => a.filter((_, j) => j !== i))}>x</Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">Columns: SKU, label, price (INR), opening stock, low-stock alert level.</p>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>Add product</Button></div>
      </div>
    </Modal>
  );
}
