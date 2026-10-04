import { env } from "../config/env.js";

export const MIN = 60_000;
export const DAY = 86_400_000;
const offsetMs = () => env.CLUB_UTC_OFFSET_MINUTES * MIN;

export const toLocalMs = (d) => d.getTime() + offsetMs();
export const minutesOfLocalDay = (d) => Math.floor((toLocalMs(d) % DAY) / MIN);
export const localDayOfWeek = (d) => new Date(toLocalMs(d)).getUTCDay(); // 0 = Sunday
export const localDateString = (d) => new Date(toLocalMs(d)).toISOString().slice(0, 10);

// [start, end) of the club's local day containing d, as real instants
export function localDayBounds(d) {
  const start = new Date(Math.floor(toLocalMs(d) / DAY) * DAY - offsetMs());
  return { start, end: new Date(start.getTime() + DAY) };
}

// "2026-10-05" -> instant of local midnight
export function dayStartFromDateString(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - offsetMs());
}

export const hhmm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
