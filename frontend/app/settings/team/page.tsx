'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi, attendantsApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Users } from 'lucide-react'

export default function TeamPage() {
  const queryClient = useQueryClient()

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const [attForm, setAttForm] = useState({
    name: '', phone: '', email: '', role: 'agent', instance_id: '',
  })

  const createAttendant = useMutation({
    mutationFn: attendantsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendants-list'] })
      setAttForm({ name: '', phone: '', email: '', role: 'agent', instance_id: '' })
    },
  })

  const deleteAttendant = useMutation({
    mutationFn: attendantsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendants-list'] }),
  })

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-500" />
          Atendentes / Gerentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {attendants.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">Nenhum atendente cadastrado.</p>
        )}
        {attendants.map(att => (
          <div key={att.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                {att.name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{att.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{att.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {att.role === 'manager' ? (
                <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 text-xs">Gerente</Badge>
              ) : (
                <Badge className="bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 text-xs">Agente</Badge>
              )}
              <button
                onClick={() => deleteAttendant.mutate(att.id)}
                className="text-zinc-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Novo Atendente</p>
          <input
            type="text"
            placeholder="Nome"
            value={attForm.name}
            onChange={e => setAttForm(f => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
          <input
            type="text"
            placeholder="Telefone (com DDI, ex: 5511999999999)"
            value={attForm.phone}
            onChange={e => setAttForm(f => ({ ...f, phone: e.target.value }))}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={attForm.role} onValueChange={v => setAttForm(f => ({ ...f, role: v }))}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agente</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={attForm.instance_id} onValueChange={v => setAttForm(f => ({ ...f, instance_id: v }))}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue placeholder="Instância" />
              </SelectTrigger>
              <SelectContent>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => createAttendant.mutate({
              name: attForm.name,
              phone: attForm.phone,
              role: attForm.role,
              instance_id: Number(attForm.instance_id),
            })}
            disabled={createAttendant.isPending || !attForm.name || !attForm.phone || !attForm.instance_id}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Adicionar Atendente
          </Button>
          {createAttendant.isError && (
            <p className="text-xs text-red-500">Erro ao criar atendente. Telefone pode já estar cadastrado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
