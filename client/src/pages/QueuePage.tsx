import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { cn } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

const COLS = [
  { status: "new", title: "New", next: "preparing", action: "Start" },
  { status: "preparing", title: "Preparing", next: "ready", action: "Ready" },
  { status: "ready", title: "Ready to serve", next: "served", action: "Served" },
] as const;

export default function QueuePage() {
  const qc = useQueryClient();
  const [station, setStation] = useState("");
  const queue = useQuery({ queryKey: ["bar-queue", station], queryFn: () => api("GET", `/bar/queue${qs({ station })}`), refetchInterval: 8_000 });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api("PATCH", `/bar/items/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bar-queue"] }); qc.invalidateQueries({ queryKey: ["bar-tab"] }); },
  });

  return (
    <>
      <PageHeader title="Kitchen and bar queue" subtitle="Refreshes every few seconds. Oldest orders are at the top." />
      <div className="mb-4 flex gap-2">
        {[["", "Everything"], ["kitchen", "Kitchen"], ["bar", "Bar"]].map(([v, l]) => (
          <button key={v} onClick={() => setStation(v)} className={cn("rounded-full px-3 py-1 text-sm", station === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</button>
        ))}
      </div>
      {queue.isLoading ? <Spinner /> : queue.error ? <ErrorBox error={queue.error} /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLS.map((c) => {
            const items = queue.data.filter((i: any) => i.status === c.status);
            return (
              <div key={c.status}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">{c.title}<Badge>{items.length}</Badge></h2>
                <div className="space-y-2">
                  {!items.length && <Card className="p-4"><Empty>Nothing here.</Empty></Card>}
                  {items.map((i: any) => (
                    <Card key={i.id} className={cn("p-4", i.waitingMinutes >= 15 && c.status !== "ready" && "border-red-300")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900">{i.quantity} x {i.item}</div>
                          {i.notes && <div className="text-sm text-amber-700">{i.notes}</div>}
                          <div className="mt-1 text-xs text-slate-500">{i.table ?? i.customer} - {i.tabNumber}</div>
                        </div>
                        <div className="text-right text-xs">
                          <Badge tone={i.station === "kitchen" ? "amber" : "blue"}>{i.station}</Badge>
                          <div className={cn("mt-1", i.waitingMinutes >= 15 ? "font-semibold text-red-600" : "text-slate-400")}>{i.waitingMinutes} min</div>
                        </div>
                      </div>
                      <Button size="sm" className="mt-3 w-full" loading={move.isPending && move.variables?.id === i.id} onClick={() => move.mutate({ id: i.id, status: c.next })}>{c.action}</Button>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
