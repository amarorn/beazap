'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import type { ConversationDetail } from '@/types'

function getInitials(name?: string | null, phone?: string) {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return (phone ?? '??').slice(-2)
}

function getStatusDot(status: string, firstResponse?: number | null) {
  if (status === 'resolved') return 'bg-emerald-400'
  if (status === 'abandoned') return 'bg-zinc-400'
  if (status === 'open') {
    return firstResponse != null ? 'bg-blue-400' : 'bg-amber-400'
  }
  return 'bg-zinc-400'
}

export function ConversationsSidebar() {
  const pathname = usePathname()
  const { selectedInstanceId } = useInstance()
  const [searchTerm, setSearchTerm] = useState('')

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', selectedInstanceId, 'open'],
    queryFn: () =>
      metricsApi.getConversations({
        limit: 50,
        instance_id: selectedInstanceId,
        status: 'open',
      }),
  })

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return conversations
    const q = searchTerm.toLowerCase()
    return conversations.filter(
      (c) =>
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.contact_phone || '').includes(q) ||
        (c.attendant_name || '').toLowerCase().includes(q)
    )
  }, [conversations, searchTerm])

  const selectedId = pathname?.match(/\/conversations\/(\d+)/)?.[1]

  return (
    <div className="w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-700 dark:from-zinc-100 dark:to-zinc-300 bg-clip-text text-transparent">
          Atendimento
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Suporte 24/7</p>
      </div>

      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 transition"
            aria-label="Buscar conversa"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2" role="navigation" aria-label="Conversas em atendimento">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-2 uppercase tracking-wide">
          Clientes em Atendimento
        </p>
        {filtered.map((conv) => {
          const isSelected = String(conv.id) === selectedId
          return (
            <Link
              key={conv.id}
              href={`/conversations/${conv.id}`}
              className={`flex items-start gap-3 p-3 rounded-xl transition-colors group block ${
                isSelected
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer'
              }`}
              aria-current={isSelected ? 'page' : undefined}
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {getInitials(conv.contact_name, conv.contact_phone)}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusDot(conv.status, conv.first_response_time_seconds)} rounded-full border-2 border-white dark:border-zinc-900`}
                  aria-hidden
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {conv.contact_name || conv.contact_phone}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
                  {conv.attendant_name || 'Sem atendente'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                  {conv.inbound_count}↓ {conv.outbound_count}↑
                </p>
              </div>
            </Link>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 px-2 py-4 text-center">
            {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa aberta'}
          </p>
        )}
      </div>

      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-2xl">
        <Link
          href="/conversations"
          className="block w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 rounded-lg font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition text-center"
        >
          Ver todas
        </Link>
      </div>
    </div>
  )
}
