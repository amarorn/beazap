'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Users, MessageSquare } from 'lucide-react'

export default function GroupsPage() {
  const { selectedInstanceId } = useInstance()

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', selectedInstanceId],
    queryFn: () => metricsApi.getGroups({ instance_id: selectedInstanceId, limit: 100 }),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Grupos</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          Mensagens recebidas de grupos do WhatsApp
        </p>
      </div>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/80">
                {['Grupo', 'ID do Grupo', 'Primeira mensagem', 'Última mensagem', 'Msgs', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Nenhum grupo encontrado. Envie uma mensagem em um grupo onde o WhatsApp está conectado.
                  </td>
                </tr>
              )}
              {groups.map(group => (
                <tr key={group.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {group.contact_name || 'Grupo sem nome'}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                    {group.contact_phone}
                  </td>
                  <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {formatDate(group.opened_at)}
                  </td>
                  <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {group.resolved_at ? formatDate(group.resolved_at) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{group.inbound_count}↓</span>
                    <span className="text-xs text-emerald-600 ml-1">{group.outbound_count}↑</span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/groups/${group.id}`}>
                      <button className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-1.5 rounded-md transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ver chat
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
