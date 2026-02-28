'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { LayoutDashboard, MessageSquare, Settings, Zap, Sun, Moon, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Instance } from '@/types'

interface SidebarProps {
  instances: Instance[]
  selectedInstanceId?: number
  onInstanceChange: (id: number | undefined) => void
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Atendimentos', icon: MessageSquare },
  { href: '/groups', label: 'Grupos', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar({ instances, selectedInstanceId, onInstanceChange }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700 flex flex-col flex-shrink-0 h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">BeaZap</span>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-none">Monitor de Atendimento</p>
          </div>
        </div>
      </div>

      {/* Instance selector */}
      {instances.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">
            Instância
          </label>
          <select
            value={selectedInstanceId ?? ''}
            onChange={e => onInstanceChange(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-700 dark:text-zinc-300"
          >
            <option value="">Todas</option>
            {instances.map(inst => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer: status + theme toggle */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Sistema ativo</span>
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
