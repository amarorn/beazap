import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/layout/Providers'
import { InstanceProvider } from '@/lib/instance-context'
import { AppShell } from '@/components/layout/AppShell'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BeaZap — Monitor de Atendimento',
  description: 'Dashboard de métricas de atendimento via WhatsApp',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={geist.className}>
        <Providers>
          <InstanceProvider>
            <AppShell>{children}</AppShell>
          </InstanceProvider>
        </Providers>
      </body>
    </html>
  )
}
