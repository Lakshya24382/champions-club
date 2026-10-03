import { useState, useEffect, useCallback } from 'react';

// ── Class strings (mapped to v1.8 CSS variables) ─────────────────────────────
export const inputCls = 'cc-input';
export const btnCls = 'cc-btn primary';
export const btnGhostCls = 'cc-btn secondary';
export const btnDangerCls = 'cc-btn danger';

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
    <label style={{ display: 'block' }}>
      <span className="cc-label">{label}</span>
      {children}
      {hint && <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>{hint}</span>}
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
        className={`max-h-[90vh] w-full ${widths[size]} overflow-y-auto panel`} style={{ borderRadius: 16, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 18, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', padding: 4, borderRadius: 6 }}
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
const STATUS_MAP = {
  active:   'success',
  expiring: 'amber',
  expired:  'danger',
  inactive: 'muted',
};

export function StatusBadge({ status }) {
  const tone = STATUS_MAP[status] ?? 'muted';
  return <span className={`pill ${tone}`}>{status}</span>;
}

const PLAN_MAP = {
  GOLD:   'amber',
  SILVER: 'muted',
  JUNIOR: 'info',
};

export function PlanBadge({ code, name }) {
  const tone = PLAN_MAP[code] ?? 'muted';
  return <span className={`pill ${tone}`}>{name}</span>;
}

// ── Loading states ────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <svg className={`animate-spin ${sizes[size]}`} style={{ color: 'var(--green2)' }} viewBox="0 0 24 24" fill="none">
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
const ALERT_ICONS = { warning: '⚠', error: '✕', info: 'ℹ', success: '✓' };

export function Alert({ type = 'info', children }) {
  return (
    <div className={`cc-alert ${type}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ flexShrink: 0 }}>{ALERT_ICONS[type]}</span>
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

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`cc-alert ${t.type}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow)', minWidth: 240 }}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => remove(t.id)} style={{ background: 'none', border: 0, opacity: .6, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Stat card (used in Dashboard) ─────────────────────────────────────────────
export function StatCard({ label, value, sub, children }) {
  return (
    <div className="kpi">
      <small>{label?.toUpperCase()}</small>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
      {children}
    </div>
  );
}

// ── Table helpers ─────────────────────────────────────────────────────────────
export function Table({ children }) {
  return (
    <div className="table-scroll">
      <table className="cc-table">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return <th className={className}>{children}</th>;
}

export function Td({ children, className = '' }) {
  return <td className={className}>{children}</td>;
}
