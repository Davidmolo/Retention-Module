'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from '@/lib/ThemeProvider';

export function LayoutWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
