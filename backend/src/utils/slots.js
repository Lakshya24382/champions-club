import { rules } from '../config.js';

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ['06:00','06:30', ... '22:00']  (last start leaves room for a full session)
export function slotStarts() {
  const out = [];
  for (
    let m = toMin(rules.openTime);
    m + rules.sessionMin <= toMin(rules.closeTime);
    m += rules.slotStepMin
  ) out.push(toHHMM(m));
  return out;
}

// Friday evening = social play. Works on a calendar date string so no timezone bugs.
export function isSocialSlot(date, time) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const m = toMin(time);
  return (
    dow === rules.social.dow &&
    m >= toMin(rules.social.from) &&
    m < toMin(rules.social.to)
  );
}
