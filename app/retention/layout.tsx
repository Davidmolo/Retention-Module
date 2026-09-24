import { Suspense } from 'react'
import { Navigation } from '@/components/Navigation'

export default function RetentionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="retention" />
      <main className="max-w-7xl mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
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
  )
}
