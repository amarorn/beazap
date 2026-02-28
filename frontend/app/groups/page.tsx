'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsApi, attendantsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Users, MessageSquare, UserCheck, ShieldCheck, RefreshCw } from 'lucide-react'
import type { ConversationDetail } from '@/types'

function GroupAvatar({ name }: { name: string | null }) {
  if (name) {
    const initials = name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? '')
      .join('')
    return (
      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {initials}
      </div>
    )
  }
  return (
    <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 flex-shrink-0">
      <Users className="w-4 h-4" />
    </div>
  )
}

function GroupConfigRow({
  group,
  attendants,
}: {
  group: ConversationDetail
  attendants: { id: number; name: string; role: string }[]
}) {
  const queryClient = useQueryClient()
  const [responsible, setResponsible] = useState<string>(
    group.responsible_id ? String(group.responsible_id) : 'none'
  )
  const [manager, setManager] = useState<string>(
    group.manager_id ? String(group.manager_id) : 'none'
  )

  const configMutation = useMutation({
    mutationFn: (data: { responsible_id: number | null; manager_id: number | null }) =>
      metricsApi.updateGroupConfig(group.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  function handleResponsibleChange(val: string) {
    setResponsible(val)
    configMutation.mutate({
      responsible_id: val !== 'none' ? Number(val) : null,
      manager_id: manager !== 'none' ? Number(manager) : null,
    })
  }

  function handleManagerChange(val: string) {
    setManager(val)
    configMutation.mutate({
      responsible_id: responsible !== 'none' ? Number(responsible) : null,
      manager_id: val !== 'none' ? Number(val) : null,
    })
  }

  const agents = attendants.filter(a => a.role === 'agent')
  const managers = attendants.filter(a => a.role === 'manager')

  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <GroupAvatar name={group.contact_name} />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {group.contact_name || <span className="text-zinc-400 dark:text-zinc-500 italic">Sem nome</span>}
          </span>
        </div>
      </td>

      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
        {group.contact_phone}
      </td>

      {/* Responsável */}
      <td className="px-5 py-3">
        <Select value={responsible} onValueChange={handleResponsibleChange}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <UserCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <SelectValue placeholder="Sem responsável" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem responsável</SelectItem>
            {(agents.length > 0 ? agents : attendants).map(a => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Gerente */}
      <td className="px-5 py-3">
        <Select value={manager} onValueChange={handleManagerChange}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
              <SelectValue placeholder="Sem gerente" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem gerente</SelectItem>
            {(managers.length > 0 ? managers : attendants).map(a => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap text-xs">
        {formatDate(group.opened_at)}
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
  )
}

export default function GroupsPage() {
  const { selectedInstanceId } = useInstance()
  const queryClient = useQueryClient()

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', selectedInstanceId],
    queryFn: () => metricsApi.getGroups({ instance_id: selectedInstanceId, limit: 100 }),
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const syncMutation = useMutation({
    mutationFn: () => metricsApi.syncGroupNames(selectedInstanceId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      alert(`${data.updated} grupo(s) atualizado(s)`)
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Grupos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Vincule um responsável e gerente a cada grupo para acompanhamento
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 gap-1.5 text-zinc-600 dark:text-zinc-400"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !selectedInstanceId}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar nomes'}
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-blue-500" />
          Responsável — atendente que monitora o grupo
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
          Gerente — supervisor direto
        </span>
      </div>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/80">
                {['Grupo', 'ID do Grupo', 'Responsável', 'Gerente', 'Primeira mensagem', 'Msgs', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-400 dark:text-zinc-500">
                    Nenhum grupo encontrado. Envie uma mensagem em um grupo onde o WhatsApp está conectado.
                  </td>
                </tr>
              )}
              {groups.map(group => (
                <GroupConfigRow key={group.id} group={group} attendants={attendants} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
