"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MessageSquareHeart,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

const retentionLinks = [
  { href: "/retention", label: "Overview" },
  { href: "/retention?view=at-risk", label: "At Risk" },
  { href: "/retention?view=follow-ups", label: "Follow-ups" },
  { href: "/retention?view=exit", label: "Exit / Turnover" },
  { href: "/retention?view=reasons", label: "Reasons" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[var(--xxii-bg)] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="relative overflow-hidden bg-[linear-gradient(180deg,#0b1f3a_0%,#122b52_55%,#0d2344_100%)] text-white">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_10%,rgba(78,161,255,.35),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(47,111,237,.25),transparent_40%)]" />
        <div className="relative flex h-full min-h-screen flex-col px-5 py-6">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-extrabold tracking-wider ring-1 ring-white/20">
              XXII
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-200/80">
                XXII Century
              </div>
              <div className="text-sm font-semibold text-white/90">Admin Panel</div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" href="#" muted />
            <NavItem icon={<Users size={18} />} label="Drivers" href="#" muted />

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={clsx(
                "mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                pathname.startsWith("/retention")
                  ? "bg-white/12 text-white"
                  : "text-white/75 hover:bg-white/8 hover:text-white"
              )}
            >
              <span className="flex items-center gap-3">
                <MessageSquareHeart size={18} />
                Retention
              </span>
              <ChevronDown
                size={16}
                className={clsx("transition", open ? "rotate-180" : "")}
              />
            </button>

            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-3 space-y-1 border-l border-white/10 pl-3"
              >
                {retentionLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </motion.div>
            )}

            <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/45">
              <AlertTriangle size={18} />
              Alerts
              <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                Soon
              </span>
            </div>
          </nav>

          <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500/20 via-blue-600/10 to-transparent p-4 ring-1 ring-white/10">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">
              People Drive Our Success
            </div>
            <p className="text-sm font-medium text-white/90">Listen. Support. Retain.</p>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              Mock GP metrics enabled until the live Gross Profit module is linked.
            </p>
          </div>

          <button
            type="button"
            className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/60 transition hover:bg-white/8 hover:text-white"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--xxii-line)] bg-white/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--xxii-muted)]">
                Driver Retention Module
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--xxii-text)]">
                Retention Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 sm:inline-flex">
                GP data: MOCK
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--xxii-blue-soft)] text-sm font-bold text-[var(--xxii-blue)]">
                AD
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  href,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
        muted
          ? "cursor-default text-white/40"
          : "text-white/75 hover:bg-white/8 hover:text-white"
      )}
      onClick={muted ? (e) => e.preventDefault() : undefined}
    >
      {icon}
      {label}
    </Link>
  );
}
