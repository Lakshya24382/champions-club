import { useState, useEffect, useCallback } from 'react';

// ── Tailwind class strings ────────────────────────────────────────────────────
export const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400';

export const btnCls =
  'inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50';

export const btnGhostCls =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.98] disabled:opacity-50';

export const btnDangerCls =
  'inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 active:scale-[.98] disabled:opacity-50';

// ── Formatter ─────────────────────────────────────────────────────────────────
export const money = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n ?? 0);

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, size = 'md', children }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${widths[size]} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Status badges ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:   { cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  expiring: { cls: 'bg-amber-100 text-amber-800 ring-amber-200',      dot: 'bg-amber-500'   },
  expired:  { cls: 'bg-red-100 text-red-700 ring-red-200',            dot: 'bg-red-500'     },
  inactive: { cls: 'bg-slate-100 text-slate-600 ring-slate-200',      dot: 'bg-slate-400'   },
};

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

const PLAN_COLORS = {
  GOLD:   'bg-amber-100 text-amber-800 ring-amber-200',
  SILVER: 'bg-slate-100 text-slate-700 ring-slate-200',
  JUNIOR: 'bg-sky-100 text-sky-800 ring-sky-200',
};

export function PlanBadge({ code, name }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${PLAN_COLORS[code] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {name}
    </span>
  );
}

// ── Loading states ────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <svg className={`animate-spin text-emerald-600 ${sizes[size]}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl">{icon}</div>
      <h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Alert / banner ────────────────────────────────────────────────────────────
const ALERT_CONFIG = {
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: '⚠️' },
  error:   { cls: 'border-red-200 bg-red-50 text-red-900',       icon: '🚫' },
  info:    { cls: 'border-blue-200 bg-blue-50 text-blue-900',     icon: 'ℹ️' },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: '✅' },
};

export function Alert({ type = 'info', children }) {
  const cfg = ALERT_CONFIG[type];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${cfg.cls}`}>
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <div>{children}</div>
    </div>
  );
}

// ── Toast notifications ───────────────────────────────────────────────────────
const toastListeners = new Set();
let toastId = 0;

export function toast(message, type = 'success') {
  const id = ++toastId;
  toastListeners.forEach((fn) => fn({ id, message, type }));
  return id;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const fn = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => remove(t.id), 3500);
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, [remove]);

  const icons = { success: '✅', error: '🚫', warning: '⚠️', info: 'ℹ️' };
  const colors = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error:   'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info:    'border-blue-200 bg-blue-50 text-blue-900',
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${colors[t.type]}`}
        >
          <span>{icons[t.type]}</span>
          <span>{t.message}</span>
          <button onClick={() => remove(t.id)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Stat card (used in Dashboard) ─────────────────────────────────────────────
export function StatCard({ label, value, sub, tone = '', children }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  );
}

// ── Table helpers ─────────────────────────────────────────────────────────────
export function Table({ children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th className={`bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
