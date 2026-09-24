import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { LayoutWrapper } from '@/components/LayoutWrapper'
import './globals.css'

export const metadata: Metadata = {
  title: 'XXII Century',
  description: 'XXII Century — fleet and gross profit management',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light">
      <body className="antialiased bg-background text-foreground">
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
