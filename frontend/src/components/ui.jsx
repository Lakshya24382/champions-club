import { useState, useEffect, useCallback } from 'react';

// ── Class strings ─────────────────────────────────────────────────────────────
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
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const widths = { sm: 440, md: 580, lg: 760, xl: 980 };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(9,32,45,.55)', padding: 16,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="modal-panel"
        style={{
          maxHeight: '90vh', width: '100%', maxWidth: widths[size],
          overflowY: 'auto', borderRadius: 18,
          background: '#fff', padding: 28,
          boxShadow: '0 24px 80px rgba(9,32,45,.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <h2 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 18, margin: 0, fontWeight: 800, color: 'var(--ink)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--line2)', border: 0, color: 'var(--muted)',
              cursor: 'pointer', padding: '5px 7px', borderRadius: 8,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
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

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const px = { sm: 16, md: 22, lg: 30 }[size];
  return (
    <svg
      width={px} height={px}
      viewBox="0 0 24 24" fill="none"
      style={{ color: 'var(--green2)', animation: 'spin .75s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div style={{ display: 'flex', minHeight: 220, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size="lg" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{icon}</div>
      <h3 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--ink2)', margin: '0 0 6px' }}>{title}</h3>
      {description && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Alert / banner ────────────────────────────────────────────────────────────
const ALERT_ICONS = { warning: '⚠', error: '✕', info: 'ℹ', success: '✓' };

export function Alert({ type = 'info', children }) {
  return (
    <div className={`cc-alert ${type}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
      <span style={{ flexShrink: 0, fontWeight: 800 }}>{ALERT_ICONS[type]}</span>
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
      setTimeout(() => remove(t.id), 3800);
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, [remove]);

  const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  return (
    <div style={{
      position: 'fixed', bottom: 22, right: 22, zIndex: 200,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`cc-alert ${t.type} toast-item`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: 'var(--shadow-lg)', minWidth: 260, maxWidth: 360,
            marginBottom: 0,
          }}
        >
          <span style={{ fontWeight: 800, flexShrink: 0 }}>{TOAST_ICONS[t.type] ?? '✓'}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            style={{ background: 'none', border: 0, opacity: .5, cursor: 'pointer', fontSize: 13, padding: '0 2px' }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
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
