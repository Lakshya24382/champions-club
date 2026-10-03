export const iso = (d) => d.toLocaleDateString('en-CA');   // YYYY-MM-DD in local time

export function presetRange(preset) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let a = t;
  let b = t;
  if (preset === 'week') {
    a = new Date(t);
    a.setDate(t.getDate() - ((t.getDay() + 6) % 7));        // Monday
  }
  if (preset === 'month') a = new Date(t.getFullYear(), t.getMonth(), 1);
  if (preset === 'last_month') {
    a = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    b = new Date(t.getFullYear(), t.getMonth(), 0);
  }
  return { from: iso(a), to: iso(b) };
}

// 'YYYY-MM' for this month (offset 0) or another month (offset -1 = last month)
export function monthOf(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return iso(d).slice(0, 7);
}
