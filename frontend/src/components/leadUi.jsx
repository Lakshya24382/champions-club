export const LEAD_STATUSES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'],
  ['trial_booked', 'Trial booked'], ['converted', 'Converted'], ['lost', 'Lost'],
];

const COLORS = {
  new: 'bg-red-100 text-red-700',
  contacted: 'bg-sky-100 text-sky-800',
  quoted: 'bg-violet-100 text-violet-800',
  trial_booked: 'bg-amber-100 text-amber-800',
  converted: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-slate-200 text-slate-600',
};

export function LeadStatusBadge({ status }) {
  const label = LEAD_STATUSES.find(([v]) => v === status)?.[1] ?? status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status] ?? ''}`}>{label}</span>;
}

export const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');   // YYYY-MM-DD in local time
};
export const todayStr = () => plusDays(0);

// Click-to-chat link. 10-digit numbers get the India country code.
export function waLink(phone, text) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
