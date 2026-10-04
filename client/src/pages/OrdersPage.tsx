import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, qs } from "../lib/api";
import { cn, fmtDateTime, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";

const TABS = [["placed", "To pack"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["", "All"]] as const;
const TONE: Record<string, "amber" | "blue" | "green" | "red"> = { placed: "amber", ready: "blue", completed: "green", cancelled: "red" };

export default function OrdersPage() {
  const [status, setStatus] = useState<string>("placed");
  const [channel, setChannel] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["shop-orders", status, channel],
    queryFn: () => api("GET", `/shop/orders${qs({ status, channel })}`),
    refetchInterval: 20_000,
  });

  return (
    <>
      <PageHeader title="Orders" subtitle="Online orders for pickup or delivery, and counter sales." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([v, label]) => (
          <button key={v} onClick={() => setStatus(v)} className={cn("rounded-full px-3 py-1 text-sm", status === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{label}</button>
        ))}
        <Select className="ml-auto w-40" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option><option value="online">Online</option><option value="counter">Counter</option>
        </Select>
      </div>

      <Card>
        {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data.length ? <Empty>No orders here.</Empty> : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th>How</Th><Th>Placed</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.data.map((o: any) => (
                <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer hover:bg-slate-50">
                  <Td className="font-mono text-xs">{o.orderNumber}</Td>
                  <Td>{o.customerName}{o.memberCode && <span className="ml-1 font-mono text-xs text-slate-400">{o.memberCode}</span>}</Td>
                  <Td><Badge tone={o.channel === "online" ? "purple" : "slate"}>{o.channel === "online" ? o.fulfilment : "counter"}</Badge></Td>
                  <Td>{fmtDateTime(o.createdAt)}</Td>
                  <Td right>{inr(o.total)}</Td>
                  <Td><Badge tone={TONE[o.status]}>{o.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function OrderModal({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState("cash");
  const { data: o, isLoading } = useQuery({ queryKey: ["shop-order", id], queryFn: () => api("GET", `/shop/orders/${id}`) });

  const done = (msg: string) => () => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["shop-orders"] });
    qc.invalidateQueries({ queryKey: ["shop-order", id] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const ready = useMutation({ mutationFn: () => api("POST", `/shop/orders/${id}/ready`, {}), onSuccess: done("Marked ready") });
  const complete = useMutation({ mutationFn: () => api("POST", `/shop/orders/${id}/complete`, { paymentMethod: method }), onSuccess: done("Order completed") });
  const cancel = useMutation({ mutationFn: () => api("POST", `/shop/orders/${id}/cancel`, {}), onSuccess: done("Order cancelled, stock returned") });

  const open = o && ["placed", "ready"].includes(o.status);
  const verb = o?.fulfilment === "delivery" ? "Delivered" : "Collected";

  return (
    <Modal title={o?.orderNumber ?? "Order"} onClose={onClose} wide>
      {isLoading || !o ? <Spinner /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[o.status]}>{o.status}</Badge>
            <Badge tone="slate">{o.channel === "online" ? o.fulfilment : "counter"}</Badge>
            <Badge tone={o.paymentStatus === "paid" ? "green" : "amber"}>{o.paymentStatus === "paid" ? `paid (${o.paymentMethod})` : "unpaid"}</Badge>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-medium">{o.customerName} {o.memberCode && <span className="font-mono text-xs text-slate-500">{o.memberCode}</span>}</div>
            {o.customerPhone && <div className="text-slate-500">{o.customerPhone}</div>}
            {o.deliveryAddress && <div className="mt-1 text-slate-600">Deliver to: {o.deliveryAddress}</div>}
            <div className="mt-1 text-xs text-slate-400">Placed {fmtDateTime(o.createdAt)}</div>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {o.items.map((i: any) => (
              <li key={i.id} className="flex justify-between px-3 py-2"><span>{i.productName} ({i.variantLabel}) x {i.quantity}</span><span>{inr(i.lineTotal)}</span></li>
            ))}
          </ul>
          <div className="space-y-1">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>
            {o.discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Member discount ({o.discountPct}%)</span><span>-{inr(o.discountAmount)}</span></div>}
            {o.deliveryFee > 0 && <div className="flex justify-between text-slate-500"><span>Delivery</span><span>{inr(o.deliveryFee)}</span></div>}
            <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{inr(o.total)}</span></div>
          </div>

          {open && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-end gap-3">
                {o.status === "placed" && <Button variant="secondary" loading={ready.isPending} onClick={() => ready.mutate()}>Mark ready</Button>}
                <Field label="Payment taken"><Select className="w-32" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option></Select></Field>
                <Button loading={complete.isPending} onClick={() => complete.mutate()}>{verb} and paid</Button>
                <Button variant="danger" className="ml-auto" loading={cancel.isPending} onClick={() => confirm("Cancel this order and return the stock?") && cancel.mutate()}>Cancel order</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
