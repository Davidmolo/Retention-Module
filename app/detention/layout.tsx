import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";

export default function DetentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="detention" />
      <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Suspense
          fallback={
            <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
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
