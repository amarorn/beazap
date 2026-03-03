'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Smartphone, Users, MessageSquare, Webhook, Bell } from 'lucide-react'

const navItems = [
  { href: '/settings', label: 'Instâncias', icon: Smartphone, exact: true },
  { href: '/settings/team', label: 'Equipe', icon: Users },
  { href: '/settings/messages', label: 'Mensagens', icon: MessageSquare },
  { href: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/settings/notifications', label: 'Alertas', icon: Bell },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Configurações</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Gerencie instâncias, equipe e preferências</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <nav className="lg:w-44 flex-shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 lg:border-r lg:border-zinc-100 lg:dark:border-zinc-800 lg:pr-4">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
