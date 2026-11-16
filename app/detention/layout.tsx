import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";

export default function DetentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-background pt-14 md:pl-60 md:pt-0">
      <Navigation currentPage="detention" />
      <main className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
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
