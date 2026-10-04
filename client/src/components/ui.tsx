import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/format";

// ---------- Button ----------
const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
};
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: "sm" | "md"; loading?: boolean };

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm",
        variants[variant],
        className
      )}
      {...rest}
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}

// ---------- Form controls ----------
const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100";
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(control, className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(control, className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(control, className)} {...p} />;

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// ---------- Layout pieces ----------
export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>{children}</div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

const tones = {
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-sky-100 text-sky-700",
  purple: "bg-violet-100 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
};
export const Badge = ({ tone = "slate", children }: { tone?: keyof typeof tones; children: ReactNode }) => (
  <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>
);

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-900")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

// ---------- Modal ----------
export function Modal({ open = true, onClose, title, children, wide }: { open?: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div className={cn("mt-10 w-full rounded-xl bg-white shadow-xl", wide ? "max-w-2xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- States ----------
export const Spinner = ({ label = "Loading..." }: { label?: string }) => <div className="py-10 text-center text-sm text-slate-400">{label}</div>;
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(error as Error)?.message ?? "Something went wrong"}</div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-10 text-center text-sm text-slate-400">{children}</div>;

// ---------- Table ----------
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm">{children}</table></div>
);
export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={cn("border-b border-slate-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500", right && "text-right")}>{children}</th>
);
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cn("border-b border-slate-100 px-3 py-2.5", right && "text-right", className)}>{children}</td>
);

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
