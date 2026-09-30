'use client';

import { Navigation } from '@/components/Navigation';

export default function DetentionPage() {
  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="detention" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-foreground">Detention</h1>
        <p className="mt-3 text-muted-foreground">
          This module is coming soon. Admins can already grant Detention access
          so it appears here when the flow ships.
        </p>
      </main>
    </div>
  );
}
