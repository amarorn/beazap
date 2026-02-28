'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, MessageSquare, Settings, Zap, Sun, Moon, Users, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { metricsApi } from '@/lib/api'
import type { Instance } from '@/types'

interface SidebarProps {
  instances: Instance[]
  selectedInstanceId?: number
  onInstanceChange: (id: number | undefined) => void
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Atendimentos', icon: MessageSquare },
  { href: '/calls', label: 'Ligações', icon: Phone },
  { href: '/groups', label: 'Grupos', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar({ instances, selectedInstanceId, onInstanceChange }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  const [slaThreshold, setSlaThreshold] = useState(30)
  useEffect(() => {
    const stored = localStorage.getItem('sla_threshold_minutes')
    if (stored) setSlaThreshold(parseInt(stored, 10))
    const handler = () => {
      const updated = localStorage.getItem('sla_threshold_minutes')
      if (updated) setSlaThreshold(parseInt(updated, 10))
    }
    window.addEventListener('sla-threshold-changed', handler)
    return () => window.removeEventListener('sla-threshold-changed', handler)
  }, [])

  const { data: slaData } = useQuery({
    queryKey: ['sla-alerts', selectedInstanceId, slaThreshold],
    queryFn: () =>
      metricsApi.getSlaAlerts({
        instance_id: selectedInstanceId,
        threshold_minutes: slaThreshold,
      }),
    refetchInterval: 60_000,
  })
  const slaCount = slaData?.count ?? 0

  return (
    <aside className="w-64 flex flex-col flex-shrink-0 h-screen bg-white dark:bg-[oklch(0.11_0.02_260)] border-r border-zinc-200/80 dark:border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-200/80 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">BeaZap</span>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-none mt-0.5">Monitor de Atendimento</p>
          </div>
        </div>
      </div>

      {/* Instance selector */}
      {instances.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.04]">
          <label className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest block mb-1.5">
            Instância
          </label>
          <select
            value={selectedInstanceId ?? ''}
            onChange={e => onInstanceChange(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full text-sm border border-zinc-200 dark:border-white/[0.08] rounded-lg px-3 py-2 bg-zinc-50 dark:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-zinc-700 dark:text-zinc-300 transition-all appearance-none cursor-pointer"
          >
            <option value="">Todas as instâncias</option>
            {instances.map(inst => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest px-3 mb-2">
          Menu
        </p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          const badge = href === '/conversations' && slaCount > 0 ? slaCount : null
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-none'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:text-zinc-800 dark:hover:text-zinc-200'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                active
                  ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                  : 'bg-zinc-100 dark:bg-white/[0.06]'
              )}>
                <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : 'text-zinc-500 dark:text-zinc-400')} />
              </div>
              <span className="flex-1">{label}</span>
              {badge !== null && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm">
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Sistema ativo</span>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-all text-xs"
            title="Alternar tema"
          >
            {theme === 'dark'
              ? <><Sun className="w-3.5 h-3.5" /><span>Claro</span></>
              : <><Moon className="w-3.5 h-3.5" /><span>Escuro</span></>
            }
          </button>
        </div>
      </div>
    </aside>
  )
}
