const TZ = "Asia/Kolkata"; // the club's local time
export const IST_OFFSET = "+05:30";

export const inr = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

export const fmtDateTime = (d: string | Date) => `${fmtDate(d)}, ${fmtTime(d)}`;

// "2026-10-04" in club time
export const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
export const longDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// "2026-10-09" + "18:00" -> "2026-10-09T18:00:00+05:30"
export const toIso = (date: string, time: string) => `${date}T${time}:00${IST_OFFSET}`;

export function ageOf(dob: string) {
  const d = new Date(dob);
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age--;
  return age;
}

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
