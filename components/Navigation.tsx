'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Menu } from 'lucide-react';
import { Button } from './ui/button';
import { ThemeToggle } from './ThemeToggle';
import {
  canAccessModule,
  isSuperAdminRole,
  type AppModule,
  type UserRole,
} from '@/lib/roles';

type PageKey =
  | 'dashboard'
  | 'drivers'
  | 'trucks'
  | 'assignments'
  | 'trips'
  | 'summary'
  | 'gross-profit'
  | 'tolls'
  | 'configurations'
  | 'retention'
  | 'settings'
  | 'detention';

interface NavigationProps {
  currentPage: PageKey;
}

/** Gross Profit dropdown — labels match the product menu mockup. */
const GP_CHILDREN: { href: string; label: string; key: PageKey }[] = [
  { href: '/gross-profit', label: 'Gross Profit table', key: 'gross-profit' },
  { href: '/admin/tolls', label: 'Toll Transactions', key: 'tolls' },
  { href: '/admin/summary', label: 'Summary', key: 'summary' },
  { href: '/admin/configurations', label: 'Configurations', key: 'configurations' },
];

const GP_CHILD_KEYS = new Set(GP_CHILDREN.map((c) => c.key));

type RetentionNavItem = {
  href: string;
  label: string;
  view: string | null;
};

const RETENTION_CHILDREN: RetentionNavItem[] = [
  { href: '/retention', label: 'Overview', view: null },
  { href: '/retention?view=responses', label: 'Responses', view: 'responses' },
  { href: '/retention?view=at-risk', label: 'At Risk', view: 'at-risk' },
  { href: '/retention?view=follow-ups', label: 'Follow-ups', view: 'follow-ups' },
  { href: '/retention?view=exit', label: 'Exit / Turnover', view: 'exit' },
  { href: '/retention?view=reasons', label: 'Reasons', view: 'reasons' },
  { href: '/retention?view=configure', label: 'Configure', view: 'configure' },
];

function linkClass(active: boolean) {
  return `block px-3 py-2 rounded-md text-sm font-medium transition ${
    active
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`;
}

function roleBadge(role: UserRole): string {
  if (isSuperAdminRole(role)) return 'Super Admin';
  if (role === 'retention') return 'Retention staff';
  return 'Admin';
}

function NavigationInner({ currentPage }: NavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onRetention = pathname.startsWith('/retention');
  const onSettings = pathname.startsWith('/settings');
  const retentionView = searchParams.get('view');

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole>('admin');
  const [modules, setModules] = useState<AppModule[]>([
    'dashboard',
    'gross-profit',
    'retention',
  ]);
  const [gpOpen, setGpOpen] = useState(() => GP_CHILD_KEYS.has(currentPage));
  const [retentionOpen, setRetentionOpen] = useState(
    () => currentPage === 'retention' || onRetention
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.user) return;
        const nextRole = (json.user.role || 'admin') as UserRole;
        setRole(nextRole);
        if (Array.isArray(json.user.modules) && json.user.modules.length) {
          setModules(json.user.modules as AppModule[]);
        }
      })
      .catch(() => {
        /* keep defaults until proven otherwise */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showDashboard = canAccessModule(modules, 'dashboard');
  const showGp = canAccessModule(modules, 'gross-profit');
  const showRetention = canAccessModule(modules, 'retention');
  const showDetention = canAccessModule(modules, 'detention');
  const onDetention = pathname.startsWith('/detention');

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const retentionSectionActive = currentPage === 'retention' || onRetention;

  return (
    <>
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-card border-b border-border flex items-center justify-between px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="XXII Century" className="h-7 w-auto" />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          className="p-2 -mr-2 text-foreground"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-card border-r border-border flex flex-col transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-4 border-b border-border">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            aria-label="XXII Century"
            className="block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="XXII Century" className="w-full h-auto" />
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {showDashboard && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className={linkClass(
                currentPage === 'dashboard' &&
                  !onSettings &&
                  !onRetention &&
                  !onDetention
              )}
            >
              Dashboard
            </Link>
          )}

          {showGp && (
            <div>
              <button
                type="button"
                onClick={() => setGpOpen((v) => !v)}
                aria-expanded={gpOpen}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition ${
                  GP_CHILD_KEYS.has(currentPage)
                    ? 'bg-muted/60 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Gross Profit
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${gpOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {gpOpen && (
                <div className="mt-1 ml-2 pl-2 border-l border-border space-y-1">
                  {GP_CHILDREN.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={linkClass(currentPage === item.key)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {showRetention && (
            <div>
              <button
                type="button"
                onClick={() => setRetentionOpen((v) => !v)}
                aria-expanded={retentionOpen}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition ${
                  retentionSectionActive
                    ? 'bg-muted/60 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Retention
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    retentionOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {retentionOpen && (
                <div className="mt-1 ml-2 pl-2 border-l border-border space-y-1">
                  {RETENTION_CHILDREN.map((item) => {
                    const active =
                      onRetention &&
                      (item.view == null
                        ? !retentionView
                        : retentionView === item.view);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={linkClass(active)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showDetention && (
            <Link
              href="/detention"
              onClick={() => setOpen(false)}
              className={linkClass(
                currentPage === 'detention' || onDetention
              )}
            >
              Detention
            </Link>
          )}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {roleBadge(role)}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={linkClass(onSettings || currentPage === 'settings')}
          >
            Settings
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              onClick={handleLogout}
              variant="outline"
              className="flex-1 text-foreground"
            >
              Logout
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Suspense boundary required for useSearchParams in App Router. */
export function Navigation({ currentPage }: NavigationProps) {
  return (
    <Suspense fallback={null}>
      <NavigationInner currentPage={currentPage} />
    </Suspense>
  );
}
