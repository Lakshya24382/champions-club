import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { api, openDocument } from "../lib/api";
import { fmtDateTime, inr } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Table, Td, Th } from "../components/ui";

export default function CollectionsPage() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["collections"], queryFn: () => api("GET", "/desk/collections/pending"), refetchInterval: 30_000 });
  const record = useMutation({
    mutationFn: (b: { kind: string; refId: number; method: string }) => api("POST", "/desk/collections", b),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const d = pending.data;

  return (
    <>
      <PageHeader title="Desk payments" subtitle="Court bookings and memberships paid at the desk. Record how each was paid so the owner's numbers match the till." />
      {pending.isLoading ? <Spinner /> : pending.error ? <ErrorBox error={pending.error} /> : (
        <Card>
          <div className="mb-3 text-sm text-slate-500">{d.count} payment(s) not recorded yet, {inr(d.amount)} in total (last 30 days up to the next 30).</div>
          {!d.items.length ? <Empty>All caught up.</Empty> : (
            <Table>
              <thead><tr><Th>Type</Th><Th>Who</Th><Th>What</Th><Th>When</Th><Th right>Amount</Th><Th right>How was it paid?</Th></tr></thead>
              <tbody>
                {d.items.map((i: any) => (
                  <tr key={`${i.kind}-${i.refId}`}>
                    <Td><Badge tone={i.kind === "membership" ? "amber" : i.kind === "social" ? "purple" : "blue"}>{i.kind}</Badge></Td>
                    <Td className="font-medium">{i.who}</Td>
                    <Td>{i.what}</Td>
                    <Td>{fmtDateTime(i.when)}</Td>
                    <Td right>{inr(i.amount)}</Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        {["cash", "card", "upi"].map((m) => (
                          <Button key={m} size="sm" variant="secondary" disabled={record.isPending} onClick={() => record.mutate({ kind: i.kind, refId: i.refId, method: m })}>{m.toUpperCase()}</Button>
                        ))}
                        {i.kind === "membership" && <Button size="sm" variant="ghost" title="Print receipt" onClick={() => openDocument(`/desk/receipts/membership/${i.refId}`).catch((e) => toast.error(e.message))}><Printer size={14} /></Button>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
