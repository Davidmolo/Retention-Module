import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";

export default function DriverCommsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--xxii-bg)] md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="driver-comms" />
      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Suspense
          fallback={
            <div className="xxii-card p-8 text-sm text-[var(--xxii-muted)]">
              Loading…
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}
