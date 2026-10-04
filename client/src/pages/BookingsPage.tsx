import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { addDays, cn, fmtTime, inr, longDate, todayStr, toIso, weekdayOf } from "../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from "../components/ui";
import PersonPicker, { emptyPerson, personPayload, personReady, type Person } from "../components/PersonPicker";

const SPORTS = ["", "tennis", "padel", "badminton", "cricket"];

const CELL: Record<string, string> = {
  free: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer",
  booked: "bg-red-100 text-red-700 cursor-not-allowed",
  social: "bg-violet-100 text-violet-700 hover:bg-violet-200 cursor-pointer",
  past: "bg-slate-50 text-slate-300 cursor-not-allowed",
};

export default function BookingsPage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [sport, setSport] = useState("");
  const [pick, setPick] = useState<{ court: any; slot: any } | null>(null);
  const [socialId, setSocialId] = useState<number | null>(null);
  const [newSocial, setNewSocial] = useState(false);

  const avail = useQuery({
    queryKey: ["availability", date, sport],
    queryFn: () => api("GET", `/availability${qs({ date, sport })}`),
    refetchInterval: 30_000,
  });
  const list = useQuery({ queryKey: ["bookings", date], queryFn: () => api("GET", `/bookings${qs({ date, status: "confirmed" })}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["availability"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };
  const cancel = useMutation({
    mutationFn: (id: number) => api("POST", `/bookings/${id}/cancel`, {}),
    onSuccess: () => { toast.success("Booking cancelled"); refresh(); },
  });

  const courts: any[] = avail.data?.[0]?.courts ?? [];
  const times: string[] = courts[0]?.slots.map((s: any) => s.time) ?? [];

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle={longDate(date)}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={16} /></Button>
            <Input type="date" className="w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={16} /></Button>
            <Button variant="secondary" size="sm" onClick={() => setDate(todayStr())}>Today</Button>
            {isManager && <Button size="sm" onClick={() => setNewSocial(true)}><Plus size={14} /> Social session</Button>}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {SPORTS.map((s) => (
          <button key={s} onClick={() => setSport(s)} className={cn("rounded-full px-3 py-1 text-sm capitalize", sport === s ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{s || "All sports"}</button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <Legend c="bg-emerald-200" t="Free" /><Legend c="bg-red-200" t="Booked" /><Legend c="bg-violet-200" t="Social play" />
        </div>
      </div>

      {avail.isLoading ? <Spinner /> : avail.error ? <ErrorBox error={avail.error} /> : !courts.length ? <Empty>No courts for this sport.</Empty> : (
        <div className="max-h-[62vh] overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="grid min-w-max" style={{ gridTemplateColumns: `64px repeat(${courts.length}, minmax(116px, 1fr))` }}>
            <div className="sticky left-0 top-0 z-20 border-b border-slate-200 bg-white" />
            {courts.map((c) => (
              <div key={c.id} className="sticky top-0 z-10 border-b border-l border-slate-200 bg-white px-2 py-2 text-center">
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs capitalize text-slate-400">{c.sport} - {inr(c.ratePerHour)}/h</div>
              </div>
            ))}
            {times.map((t, i) => (
              <Fragment key={t}>
                <div className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-2 text-xs text-slate-500">{t}</div>
                {courts.map((c) => {
                  const slot = c.slots[i];
                  const clickable = slot.state === "free" || slot.state === "social";
                  return (
                    <button
                      key={c.id} disabled={!clickable}
                      onClick={() => slot.state === "social" ? setSocialId(slot.bookingId) : setPick({ court: c, slot })}
                      className={cn("border-b border-l border-slate-100 px-1 py-2 text-xs font-medium", CELL[slot.state])}
                    >
                      {slot.state === "free" ? "Free" : slot.state === "booked" ? "Booked" : slot.state === "social" ? `Social - ${slot.spotsLeft} left` : "-"}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">Each session lasts one hour, so booking 17:00 also blocks 16:30 and 17:30 on that court.</p>

      <Card className="mt-6">
        <h2 className="mb-3 font-medium text-slate-900">Confirmed bookings, {longDate(date)}</h2>
        {list.isLoading ? <Spinner /> : !list.data?.length ? <Empty>Nothing booked for this day.</Empty> : (
          <Table>
            <thead><tr><Th>Time</Th><Th>Court</Th><Th>Who</Th><Th>Type</Th><Th right>Price</Th><Th /></tr></thead>
            <tbody>
              {list.data.map((b: any) => (
                <tr key={b.id}>
                  <Td>{fmtTime(b.startsAt)} - {fmtTime(b.endsAt)}</Td>
                  <Td>{b.court.name}</Td>
                  <Td>
                    {b.kind === "social" ? <button className="font-medium text-violet-700 hover:underline" onClick={() => setSocialId(b.id)}>{b.title}</button>
                      : b.memberName ? <>{b.memberName} <span className="font-mono text-xs text-slate-400">{b.memberCode}</span></>
                      : <>{b.guestName} <span className="text-xs text-slate-400">{b.guestPhone}</span></>}
                  </Td>
                  <Td><Badge tone={b.kind === "social" ? "purple" : b.memberId ? "green" : "slate"}>{b.kind === "social" ? "social" : b.memberId ? "member" : "guest"}</Badge></Td>
                  <Td right>{b.kind === "social" ? `${inr(b.pricePerPlayer)}/player` : b.price === 0 ? "Free" : inr(b.price)}</Td>
                  <Td right>
                    {new Date(b.startsAt) > new Date() && (
                      <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this booking?") && cancel.mutate(b.id)}>Cancel</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {pick && <BookModal {...pick} onClose={() => setPick(null)} onDone={refresh} />}
      {socialId && <SocialModal id={socialId} onClose={() => setSocialId(null)} onDone={refresh} />}
      {newSocial && <NewSocialModal date={date} onClose={() => setNewSocial(false)} onDone={refresh} />}
    </>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1"><i className={cn("inline-block h-3 w-3 rounded", c)} />{t}</span>;

// ---------- Book a regular 1-hour session ----------
function BookModal({ court, slot, onClose, onDone }: { court: any; slot: any; onClose: () => void; onDone: () => void }) {
  const [person, setPerson] = useState<Person>(emptyPerson);
  const book = useMutation({
    mutationFn: () => api("POST", "/bookings", { courtId: court.id, startsAt: slot.startsAt, ...personPayload(person) }),
    onSuccess: (b) => {
      toast.success(`Booked ${court.name} at ${slot.time} - ${b.price === 0 ? "free for this member" : inr(b.price)}`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Book ${court.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <b className="capitalize">{court.sport}</b> at <b>{slot.time}</b> for 1 hour. Walk-in rate {inr(court.ratePerHour)}; members get their plan rate.
        </div>
        <PersonPicker value={person} onChange={setPerson} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!personReady(person)} loading={book.isPending} onClick={() => book.mutate()}>Confirm booking</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Friday social session: roster, join, leave, cancel ----------
function SocialModal({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [person, setPerson] = useState<Person>(emptyPerson);
  const { data: s, isLoading } = useQuery({ queryKey: ["social", id], queryFn: () => api("GET", `/bookings/${id}`) });
  const reload = () => { qc.invalidateQueries({ queryKey: ["social", id] }); onDone(); };

  const join = useMutation({
    mutationFn: () => api("POST", `/bookings/${id}/join`, personPayload(person)),
    onSuccess: (r) => { toast.success(`Joined - ${r.spotsLeft} spot(s) left`); setPerson(emptyPerson); reload(); },
  });
  const leave = useMutation({
    mutationFn: (pid: number) => api("POST", `/bookings/${id}/participants/${pid}/cancel`, {}),
    onSuccess: reload,
  });
  const cancelAll = useMutation({
    mutationFn: () => api("POST", `/bookings/${id}/cancel`, {}),
    onSuccess: () => { toast.success("Session cancelled"); onDone(); onClose(); },
  });

  return (
    <Modal title={s?.title ?? "Social session"} onClose={onClose} wide>
      {isLoading || !s ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>{s.court.name}</span><span>{fmtTime(s.startsAt)} - {fmtTime(s.endsAt)}</span>
            <Badge tone="purple">{inr(s.pricePerPlayer)} per player</Badge>
            <Badge tone={s.spotsLeft > 0 ? "green" : "red"}>{s.spotsLeft} of {s.capacity} spots left</Badge>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Players</h3>
            {s.participants.filter((p: any) => p.status === "confirmed").length === 0 ? <p className="text-sm text-slate-400">Nobody has joined yet.</p> : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {s.participants.filter((p: any) => p.status === "confirmed").map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{p.memberName ?? p.guestName} {p.memberCode && <span className="font-mono text-xs text-slate-400">{p.memberCode}</span>}</span>
                    <span className="flex items-center gap-3"><span className="text-slate-500">{p.price === 0 ? "Free" : inr(p.price)}</span>
                      <Button size="sm" variant="ghost" onClick={() => leave.mutate(p.id)}>Remove</Button></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {s.spotsLeft > 0 && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium">Add a player</h3>
              <PersonPicker value={person} onChange={setPerson} />
              <div className="flex justify-end"><Button disabled={!personReady(person)} loading={join.isPending} onClick={() => join.mutate()}>Add to session</Button></div>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button variant="danger" size="sm" loading={cancelAll.isPending} onClick={() => confirm("Cancel the whole session for everyone?") && cancelAll.mutate()}>Cancel session</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Create a Friday social session (managers) ----------
function NewSocialModal({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const courts = useQuery({ queryKey: ["courts"], queryFn: () => api("GET", "/courts") });
  const [f, setF] = useState({ courtId: "", date, time: "18:00", duration: 120, capacity: 8, price: 300, title: "" });
  const set = (k: string, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  const notFriday = weekdayOf(f.date) !== 5;

  const create = useMutation({
    mutationFn: () => api("POST", "/bookings/social", {
      courtId: Number(f.courtId), startsAt: toIso(f.date, f.time), durationMinutes: Number(f.duration),
      capacity: Number(f.capacity), pricePerPlayer: Number(f.price), ...(f.title.trim() ? { title: f.title.trim() } : {}),
    }),
    onSuccess: () => { toast.success("Social session created"); onDone(); onClose(); },
  });
  const starts = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];

  return (
    <Modal title="New Friday social session" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Court">
          <Select value={f.courtId} onChange={(e) => set("courtId", e.target.value)}>
            <option value="">Choose a court</option>
            {courts.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.sport})</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" hint={notFriday ? "Social play runs on Fridays only" : undefined}><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Starts"><Select value={f.time} onChange={(e) => set("time", e.target.value)}>{starts.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Duration"><Select value={f.duration} onChange={(e) => set("duration", Number(e.target.value))}>{[60, 90, 120, 150, 180, 210, 240].map((m) => <option key={m} value={m}>{m / 60} h</option>)}</Select></Field>
          <Field label="Capacity"><Input type="number" min={2} max={40} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></Field>
        </div>
        <Field label="Price per player (INR)"><Input type="number" min={0} value={f.price} onChange={(e) => set("price", Number(e.target.value))} /></Field>
        <Field label="Title (optional)"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Friday Social - Padel" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.courtId || notFriday} loading={create.isPending} onClick={() => create.mutate()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
