import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { cn, fmtTime, inr } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Textarea } from "../components/ui";
import MemberCodeInput from "../components/MemberCodeInput";
import BarTabModal from "../components/BarTabModal";

export default function BarPage() {
  const qc = useQueryClient();
  const [tabId, setTabId] = useState<number | null>(null);
  const [opening, setOpening] = useState<{ table: any | null } | null>(null);

  const tables = useQuery({ queryKey: ["bar-tables"], queryFn: () => api("GET", "/bar/tables"), refetchInterval: 15_000 });
  const openTabs = useQuery({ queryKey: ["bar-open-tabs"], queryFn: () => api("GET", "/bar/tabs?status=open"), refetchInterval: 15_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bar-tables"] });
    qc.invalidateQueries({ queryKey: ["bar-open-tabs"] });
  };
  const standalone = (openTabs.data ?? []).filter((t: any) => !t.tableId);

  return (
    <>
      <PageHeader title="Bar and cafe" subtitle="Tables, tabs and orders. Discounts apply automatically from the member code." actions={<Button onClick={() => setOpening({ table: null })}><Plus size={16} /> Tab without table</Button>} />
      <ShiftCard />

      {tables.isLoading ? <Spinner /> : tables.error ? <ErrorBox error={tables.error} /> : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.data.map((t: any) => (
            <button
              key={t.id}
              onClick={() => (t.tab ? setTabId(t.tab.id) : setOpening({ table: t }))}
              className={cn("rounded-xl border p-4 text-left transition-colors", t.tab ? "border-amber-300 bg-amber-50 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100")}
            >
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">{t.name}</span><span className="text-xs text-slate-500">{t.seats} seats</span></div>
              {t.tab ? (
                <div className="mt-2 text-sm">
                  <div className="font-medium">{t.tab.customerName}</div>
                  <div className="text-slate-600">{t.tab.itemCount} item(s) - {inr(t.tab.total)}</div>
                  <div className="text-xs text-slate-400">since {fmtTime(t.tab.openedAt)}</div>
                </div>
              ) : <div className="mt-2 text-sm text-emerald-700">Free</div>}
            </button>
          ))}
        </div>
      )}

      {standalone.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 font-medium text-slate-900">Tabs without a table</h2>
          <div className="flex flex-wrap gap-2">
            {standalone.map((t: any) => (
              <button key={t.id} onClick={() => setTabId(t.id)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100">
                <div className="font-medium">{t.customerName}</div><div className="text-xs text-slate-600">{t.itemCount} item(s) - {inr(t.total)}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {opening && <OpenTabModal table={opening.table} onClose={() => setOpening(null)} onOpened={(id) => { refresh(); setOpening(null); setTabId(id); }} />}
      {tabId && <BarTabModal id={tabId} onClose={() => setTabId(null)} onDone={refresh} />}
    </>
  );
}

function OpenTabModal({ table, onClose, onOpened }: { table: any | null; onClose: () => void; onOpened: (id: number) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const open = useMutation({
    mutationFn: () => api("POST", "/bar/tabs", {
      ...(table ? { tableId: table.id } : {}),
      ...(code.trim() ? { memberCode: code.trim() } : name.trim() ? { customerName: name.trim() } : {}),
    }),
    onSuccess: (t) => { toast.success(`Tab ${t.tabNumber} opened`); onOpened(t.id); },
  });
  return (
    <Modal title={table ? `Open tab: ${table.name}` : "Open a tab (no table)"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Member code (optional)" hint="Adds the member's bar discount to the whole tab."><MemberCodeInput value={code} onChange={setCode} /></Field>
        {!code.trim() && <Field label="Name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={table?.name ?? "Guest"} /></Field>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={open.isPending} onClick={() => open.mutate()}>Open tab</Button></div>
      </div>
    </Modal>
  );
}

function ShiftCard() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"start" | "end" | null>(null);
  const shift = useQuery({ queryKey: ["shift"], queryFn: () => api("GET", "/bar/shifts/current") });
  const done = () => qc.invalidateQueries({ queryKey: ["shift"] });
  const s = shift.data;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      {shift.isLoading ? <span className="text-sm text-slate-400">Checking your shift...</span> : s ? (
        <>
          <div className="text-sm"><Badge tone="green">Shift in progress</Badge><span className="ml-3 text-slate-600">Started {fmtTime(s.startedAt)} with {inr(s.openingCash)} in the till</span></div>
          <Button variant="secondary" onClick={() => setDialog("end")}>End shift</Button>
        </>
      ) : (
        <>
          <div className="text-sm text-slate-600"><Badge tone="amber">No shift</Badge><span className="ml-3">Start your shift before taking bar payments.</span></div>
          <Button onClick={() => setDialog("start")}>Start shift</Button>
        </>
      )}
      {dialog === "start" && <StartShift onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "end" && <EndShift onClose={() => setDialog(null)} onDone={done} />}
    </Card>
  );
}

function StartShift({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cash, setCash] = useState(0);
  const start = useMutation({
    mutationFn: () => api("POST", "/bar/shifts/start", { openingCash: cash }),
    onSuccess: () => { toast.success("Shift started"); onDone(); onClose(); },
  });
  return (
    <Modal title="Start shift" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Cash in the till (INR)" hint="Count the float before you begin."><Input type="number" min={0} value={cash} onChange={(e) => setCash(Number(e.target.value))} autoFocus /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={start.isPending} onClick={() => start.mutate()}>Start</Button></div>
      </div>
    </Modal>
  );
}

function EndShift({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cash, setCash] = useState(0);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<any>(null);
  const end = useMutation({
    mutationFn: () => api("POST", "/bar/shifts/end", { closingCash: cash, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: (r) => { setResult(r); onDone(); },
  });

  if (result) {
    return (
      <Modal title="Shift closed" onClose={onClose}>
        <div className="space-y-2 text-sm">
          <Row k="Opening cash" v={inr(result.openingCash)} />
          <Row k="Cash taken from sales" v={inr(result.cashTaken)} />
          <Row k="Expected in the till" v={inr(result.expectedCash)} />
          <Row k="You counted" v={inr(result.closingCash)} />
          <div className={cn("flex justify-between border-t border-slate-100 pt-2 text-base font-semibold", result.variance === 0 ? "text-emerald-600" : "text-red-600")}>
            <span>{result.variance === 0 ? "Till balances" : result.variance > 0 ? "Over by" : "Short by"}</span><span>{result.variance === 0 ? "" : inr(Math.abs(result.variance))}</span>
          </div>
          <div className="flex justify-end pt-2"><Button onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="End shift" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Cash counted in the till (INR)" hint="Count everything, including the opening float."><Input type="number" min={0} value={cash} onChange={(e) => setCash(Number(e.target.value))} autoFocus /></Field>
        <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={end.isPending} onClick={() => end.mutate()}>Close shift</Button></div>
      </div>
    </Modal>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span className="text-slate-500">{k}</span><span>{v}</span></div>;
