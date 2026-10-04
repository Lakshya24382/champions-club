import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Bell, CalendarCheck, CalendarDays, ChefHat, ClipboardList, Coffee, FileText, HandCoins, Inbox, LayoutDashboard, LogOut, Menu, Package, Receipt, ShoppingCart, TrendingUp, Truck, Users, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, type Role } from "../lib/auth";
import { cn } from "../lib/format";

type NavItem = { to: string; label: string; icon: LucideIcon; roles?: Role[]; end?: boolean };

// One list drives the sidebar. `roles` hides items a user cannot use.
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "manager"], end: true },
  { to: "/app/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/app/members", label: "Members", icon: Users },
  { to: "/app/shop", label: "Pro shop", icon: ShoppingCart },
  { to: "/app/orders", label: "Orders", icon: Truck },
  { to: "/app/inventory", label: "Inventory", icon: Package },
  { to: "/app/bar", label: "Bar and cafe", icon: Coffee },
  { to: "/app/queue", label: "Kitchen queue", icon: ChefHat },
  { to: "/app/bar-report", label: "Bar report", icon: ClipboardList, roles: ["owner", "manager"] },
  { to: "/app/enquiries", label: "Enquiries", icon: Inbox },
  { to: "/app/collections", label: "Desk payments", icon: HandCoins },
  { to: "/app/leave", label: "Leave", icon: CalendarCheck },
  { to: "/app/invoices", label: "Invoices", icon: FileText, roles: ["owner", "manager"] },
  { to: "/app/expenses", label: "Expenses", icon: Receipt, roles: ["owner", "manager"] },
  { to: "/app/payroll", label: "Staff and payroll", icon: Banknote, roles: ["owner", "manager"] },
  { to: "/app/reports", label: "Reports", icon: TrendingUp, roles: ["owner", "manager"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // Unread staff alerts, refreshed every 30 seconds
  const alerts = useQuery({
    queryKey: ["alerts-count"],
    queryFn: () => api("GET", "/notifications?unread=true&limit=1"),
    refetchInterval: 30_000,
  });
  const unread = alerts.data?.unread ?? 0;
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user!.role));

  return (
    <div className="min-h-screen md:flex">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-60 overflow-y-auto bg-brand-900 p-4 text-white transition-transform md:static md:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 px-2 text-lg font-bold tracking-tight">Champions Club</div>
        <nav className="space-y-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", isActive ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10")}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded p-1 text-slate-600 md:hidden" onClick={() => setOpen(true)}><Menu /></button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-4">
            <button onClick={() => nav("/app/alerts")} className="relative rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Alerts">
              <Bell size={20} />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            <div className="text-right text-sm leading-tight">
              <div className="font-medium text-slate-900">{user!.fullName}</div>
              <div className="text-xs capitalize text-slate-500">{user!.role}</div>
            </div>
            <button onClick={() => { logout(); nav("/login"); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Sign out"><LogOut size={20} /></button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
