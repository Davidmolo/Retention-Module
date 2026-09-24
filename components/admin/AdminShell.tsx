"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareHeart,
  Users,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  navigateRetentionView,
  parseRetentionView,
  retentionViewPath,
  RETENTION_VIEW_EVENT,
  type RetentionView,
} from "@/lib/retention/viewNav";

const retentionLinks: { view: RetentionView; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "responses", label: "Responses" },
  { view: "at-risk", label: "At Risk" },
  { view: "follow-ups", label: "Follow-ups" },
  { view: "exit", label: "Exit / Turnover" },
  { view: "reasons", label: "Reasons" },
];

/** Keeps page content from re-rendering when sidebar/header chrome state changes. */
const PageBody = memo(function PageBody({ children }: { children: ReactNode }) {
  return (
    <main className="w-full min-w-0 max-w-full overflow-x-hidden p-3 sm:p-6 lg:p-8">
      {children}
    </main>
  );
});

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [retentionExpanded, setRetentionExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const onDriverDetail = pathname.startsWith("/retention/drivers/");

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleMobile = useCallback(() => {
    setMobileOpen((open) => !open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded((v) => !v);
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarExpanded(true);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div
      className={clsx(
        "min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--xxii-bg)] lg:grid lg:h-svh lg:max-h-svh lg:overflow-hidden",
        sidebarExpanded
          ? "lg:grid-cols-[260px_minmax(0,1fr)]"
          : "lg:grid-cols-[72px_minmax(0,1fr)]"
      )}
    >
      <aside
        className={clsx(
          "relative hidden min-w-0 bg-[linear-gradient(180deg,#0b1f3a_0%,#122b52_55%,#0d2344_100%)] text-white lg:flex lg:h-svh lg:max-h-svh lg:flex-col lg:overflow-hidden",
          sidebarExpanded ? "w-[260px]" : "w-[72px]"
        )}
      >
        <SidebarContent
          pathname={pathname}
          expanded={sidebarExpanded}
          retentionExpanded={retentionExpanded}
          setRetentionExpanded={setRetentionExpanded}
          onExpandSidebar={expandSidebar}
        />
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Collapse menu"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={toggleMobile}
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-svh max-h-svh w-[min(280px,88vw)] flex-col overflow-hidden bg-[linear-gradient(180deg,#0b1f3a_0%,#122b52_55%,#0d2344_100%)] text-white shadow-2xl transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        )}
        aria-hidden={!mobileOpen}
      >
        <SidebarContent
          pathname={pathname}
          expanded
          retentionExpanded={retentionExpanded}
          setRetentionExpanded={setRetentionExpanded}
          onClose={closeMobile}
        />
      </aside>

      <div className="min-w-0 max-w-full overflow-x-hidden lg:h-svh lg:max-h-svh lg:overflow-y-auto">
        <header className="sticky top-0 z-30 border-b border-[var(--xxii-line)] bg-white px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className={clsx(
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 lg:hidden",
                  mobileOpen
                    ? "bg-[var(--xxii-blue)] text-white ring-[var(--xxii-blue)]"
                    : "bg-slate-100 text-slate-700 ring-slate-200"
                )}
                aria-label={mobileOpen ? "Collapse menu" : "Expand menu"}
                aria-expanded={mobileOpen}
                onClick={toggleMobile}
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>

              <button
                type="button"
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 lg:inline-flex"
                aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                aria-expanded={sidebarExpanded}
                onClick={toggleSidebar}
              >
                {sidebarExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>

              <div className="min-w-0">
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--xxii-muted)] sm:text-xs">
                  Driver Retention Module
                </div>
                <h1 className="truncate text-lg font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-xl">
                  {onDriverDetail ? "Driver Detail" : "Retention Dashboard"}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 sm:inline-flex">
                GP data: {(process.env.NEXT_PUBLIC_GP_ADAPTER || "live").toUpperCase()}
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--xxii-blue-soft)] text-sm font-bold text-[var(--xxii-blue)] sm:h-10 sm:w-10">
                AD
              </div>
            </div>
          </div>
        </header>
        <PageBody>{children}</PageBody>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  expanded,
  retentionExpanded,
  setRetentionExpanded,
  onExpandSidebar,
  onClose,
}: {
  pathname: string;
  expanded: boolean;
  retentionExpanded: boolean;
  setRetentionExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  onExpandSidebar?: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={clsx(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-5 sm:py-6",
        expanded ? "px-4 sm:px-5" : "px-2"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_10%,rgba(78,161,255,.35),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(47,111,237,.25),transparent_40%)]" />

      <div
        className={clsx(
          "relative mb-6 flex shrink-0 items-center gap-3 sm:mb-8",
          expanded ? "justify-between px-2" : "justify-center"
        )}
      >
        <div className={clsx("flex items-center gap-3", !expanded && "justify-center")}>
          <img
            src="/logo.png"
            alt="XXII Century"
            className={clsx(
              "shrink-0 object-contain",
              expanded ? "h-9 w-auto" : "h-8 w-8"
            )}
          />
          {expanded && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-200/80">
                XXII Century
              </div>
              <div className="text-sm font-semibold text-white/90">Admin Panel</div>
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Collapse menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="relative flex min-h-0 flex-1 flex-col gap-1">
        <NavItem
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          href="#"
          muted
          collapsed={!expanded}
        />
        <NavItem
          icon={<Users size={18} />}
          label="Drivers"
          href="#"
          muted
          collapsed={!expanded}
        />

        <button
          type="button"
          aria-expanded={retentionExpanded}
          title="Retention"
          onClick={() => {
            if (!expanded && onExpandSidebar) {
              onExpandSidebar();
              setRetentionExpanded(true);
              return;
            }
            setRetentionExpanded((v) => !v);
          }}
          className={clsx(
            "mt-1 flex items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold",
            expanded ? "w-full justify-between" : "w-full justify-center",
            pathname.startsWith("/retention")
              ? "bg-white/12 text-white"
              : "text-white/75 hover:bg-white/8 hover:text-white"
          )}
        >
          <span className={clsx("flex items-center", expanded ? "gap-3" : "")}>
            <MessageSquareHeart size={18} />
            {expanded && "Retention"}
          </span>
          {expanded && (
            <ChevronDown
              size={16}
              className={clsx(retentionExpanded ? "rotate-180" : "")}
            />
          )}
        </button>

        {expanded && retentionExpanded && (
          <div className="ml-3 space-y-1 border-l border-white/10 py-1 pl-3">
            <Suspense fallback={null}>
              <RetentionSubnav onNavigate={onClose} />
            </Suspense>
          </div>
        )}

        <AlertsNav
          expanded={expanded}
          pathname={pathname}
          onNavigate={onClose}
        />
      </nav>

      {expanded && (
        <div className="relative mt-6 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500/20 via-blue-600/10 to-transparent p-4 ring-1 ring-white/10">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">
            People Drive Our Success
          </div>
          <p className="text-sm font-medium text-white/90">Listen. Support. Retain.</p>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            {(process.env.NEXT_PUBLIC_GP_ADAPTER || "live").toLowerCase() ===
            "mock"
              ? "Demo GP roster is active. Set GP_ADAPTER=live for production data."
              : "Connected to live Gross Profit driver data."}
          </p>
        </div>
      )}

      <button
        type="button"
        title="Sign out"
        className={clsx(
          "relative mt-4 flex shrink-0 items-center rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white",
          expanded ? "gap-2" : "justify-center"
        )}
      >
        <LogOut size={16} />
        {expanded && "Sign out"}
      </button>
    </div>
  );
}

function AlertsNav({
  expanded,
  pathname,
  onNavigate,
}: {
  expanded: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  function go() {
    onNavigate?.();
    if (pathname === "/retention") {
      navigateRetentionView("at-risk");
      return;
    }
    router.push(retentionViewPath("at-risk"));
  }

  return (
    <button
      type="button"
      title="Alerts · At Risk"
      onClick={go}
      className={clsx(
        "mt-2 flex items-center rounded-xl px-3 py-2.5 text-left text-sm text-white/75 hover:bg-white/8 hover:text-white",
        expanded ? "w-full gap-3" : "w-full justify-center"
      )}
    >
      <AlertTriangle size={18} />
      {expanded && (
        <>
          Alerts
          <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
            At Risk
          </span>
        </>
      )}
    </button>
  );
}

function RetentionSubnav({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const onList = pathname === "/retention";
  const [currentView, setCurrentView] = useState<RetentionView>("overview");

  useEffect(() => {
    const sync = () => setCurrentView(parseRetentionView(window.location.search));
    const onView = (e: Event) => {
      const next = (e as CustomEvent<RetentionView>).detail;
      if (next) setCurrentView(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener(RETENTION_VIEW_EVENT, onView);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(RETENTION_VIEW_EVENT, onView);
    };
  }, []);

  function go(view: RetentionView) {
    onNavigate?.();
    if (onList) {
      setCurrentView(view);
      navigateRetentionView(view);
      return;
    }
    router.push(retentionViewPath(view));
  }

  return (
    <>
      {retentionLinks.map((link) => {
        const active = onList && currentView === link.view;
        return (
          <button
            key={link.view}
            type="button"
            onClick={() => go(link.view)}
            className={clsx(
              "block w-full rounded-lg px-3 py-2 text-left text-sm",
              active
                ? "bg-white/12 font-semibold text-white"
                : "text-white/70 hover:bg-white/8 hover:text-white"
            )}
          >
            {link.label}
          </button>
        );
      })}
    </>
  );
}

function NavItem({
  icon,
  label,
  href,
  muted,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  muted?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={clsx(
        "flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold",
        collapsed ? "justify-center" : "gap-3",
        muted
          ? "cursor-default text-white/40"
          : "text-white/75 hover:bg-white/8 hover:text-white"
      )}
      onClick={muted ? (e) => e.preventDefault() : undefined}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
}
