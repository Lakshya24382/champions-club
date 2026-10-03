export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none';
export const btnCls =
  'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';
export const btnGhostCls =
  'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100';

export const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800',
  expiring: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
  inactive: 'bg-slate-200 text-slate-600',
};
export function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? ''}`}>
      {status}
    </span>
  );
}

const PLAN_COLORS = { GOLD: 'bg-yellow-100 text-yellow-800', SILVER: 'bg-slate-200 text-slate-700', JUNIOR: 'bg-sky-100 text-sky-800' };
export function PlanBadge({ code, name }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_COLORS[code] ?? ''}`}>{name}</span>;
}
