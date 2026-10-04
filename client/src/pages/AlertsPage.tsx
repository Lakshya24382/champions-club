import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["alerts"], queryFn: () => api("GET", "/notifications") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["alerts"] }); qc.invalidateQueries({ queryKey: ["alerts-count"] }); };
  const readAll = useMutation({ mutationFn: () => api("POST", "/notifications/read-all"), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: number) => api("POST", `/notifications/${id}/read`), onSuccess: refresh });

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Website enquiries, trial bookings and leave decisions land here."
        actions={<Button variant="secondary" disabled={!data?.unread} onClick={() => readAll.mutate()}>Mark all read</Button>}
      />
      {isLoading ? <Spinner /> : error ? <ErrorBox error={error} /> : !data.data.length ? <Empty>No alerts yet.</Empty> : (
        <div className="space-y-3">
          {data.data.map((n: any) => (
            <Card key={n.id} className={n.readAt ? "opacity-60" : "border-l-4 border-l-brand-500"}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">{n.subject}</div>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
                  <div className="mt-2 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</div>
                </div>
                {n.readAt ? <Badge>read</Badge> : <Button size="sm" variant="secondary" onClick={() => readOne.mutate(n.id)}>Mark read</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
