import { cn } from "../lib/format";
import { Field, Input } from "./ui";
import MemberCodeInput from "./MemberCodeInput";

export type Person = { mode: "member" | "guest"; memberCode: string; guestName: string; guestPhone: string };
export const emptyPerson: Person = { mode: "member", memberCode: "", guestName: "", guestPhone: "" };

// Converts the form state to the fields the booking API expects
export const personPayload = (p: Person) =>
  p.mode === "member" ? { memberCode: p.memberCode.trim() } : { guestName: p.guestName.trim(), guestPhone: p.guestPhone.trim() };

export const personReady = (p: Person) =>
  p.mode === "member" ? p.memberCode.trim().length >= 3 : p.guestName.trim().length >= 2 && p.guestPhone.trim().length >= 10;

// "Member or walk-in guest?" toggle used by bookings and social sessions
export default function PersonPicker({ value, onChange }: { value: Person; onChange: (p: Person) => void }) {
  const tab = (mode: Person["mode"], label: string) => (
    <button
      type="button" onClick={() => onChange({ ...value, mode })}
      className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", value.mode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
    >{label}</button>
  );
  return (
    <div className="space-y-3">
      <div className="flex rounded-lg bg-slate-100 p-1">{tab("member", "Member")}{tab("guest", "Walk-in guest")}</div>
      {value.mode === "member" ? (
        <Field label="Member code"><MemberCodeInput value={value.memberCode} onChange={(v) => onChange({ ...value, memberCode: v })} /></Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guest name"><Input value={value.guestName} onChange={(e) => onChange({ ...value, guestName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={value.guestPhone} onChange={(e) => onChange({ ...value, guestPhone: e.target.value })} placeholder="9876543210" /></Field>
        </div>
      )}
    </div>
  );
}
