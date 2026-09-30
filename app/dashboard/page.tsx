'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import {
  COMPANY_UPDATES,
  formatUpdateDate,
} from '@/lib/companyUpdates';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const greeting = useMemo(() => greetingForHour(now.getHours()), [now]);
  const dateLabel = useMemo(() => formatLongDate(now), [now]);

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="dashboard" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="mb-12 text-center sm:text-left">
          <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            {greeting}
          </p>
          <p className="mt-2 text-lg text-muted-foreground">
            Welcome back to XXII Admin.
          </p>
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {dateLabel}
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">
                Company Updates
              </h2>
              <p className="text-sm text-muted-foreground">
                What&apos;s new across XXII modules
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {COMPANY_UPDATES.map((update) => (
              <li key={update.id} className="px-6 py-5">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {update.tag ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {update.tag}
                    </span>
                  ) : null}
                  <time
                    dateTime={update.date}
                    className="text-xs text-muted-foreground"
                  >
                    {formatUpdateDate(update.date)}
                  </time>
                </div>
                <h3 className="text-base font-semibold text-card-foreground">
                  {update.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {update.summary}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
