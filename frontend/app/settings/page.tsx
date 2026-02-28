'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi, attendantsApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus } from 'lucide-react'

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  // Instance form
  const [instForm, setInstForm] = useState({
    name: '', instance_name: '', api_url: '', api_key: '', phone_number: '',
  })

  // Attendant form
  const [attForm, setAttForm] = useState({
    name: '', phone: '', email: '', role: 'agent', instance_id: '',
  })

  const createInstance = useMutation({
    mutationFn: instancesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setInstForm({ name: '', instance_name: '', api_url: '', api_key: '', phone_number: '' })
    },
  })

  const deleteInstance = useMutation({
    mutationFn: instancesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instances'] }),
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Configurações</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Gerencie instâncias e atendentes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Instances */}
        <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base dark:text-zinc-100">Instâncias WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {instances.map(inst => (
              <div key={inst.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{inst.name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{inst.instance_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <button
                    onClick={() => deleteInstance.mutate(inst.id)}
                    className="text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Nova Instância</p>
              {[
                { key: 'name', placeholder: 'Nome (ex: Suporte)' },
                { key: 'instance_name', placeholder: 'Instance name (Evolution API)' },
                { key: 'api_url', placeholder: 'URL da API (ex: http://localhost:8080)' },
                { key: 'api_key', placeholder: 'API Key' },
                { key: 'phone_number', placeholder: 'Telefone (opcional)' },
              ].map(({ key, placeholder }) => (
                <input
                  key={key}
                  type="text"
                  placeholder={placeholder}
                  value={instForm[key as keyof typeof instForm]}
                  onChange={e => setInstForm(f => ({ ...f, [key]: e.target.value }))}
                  className={inputClass}
                />
              ))}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => createInstance.mutate({
                  name: instForm.name,
                  instance_name: instForm.instance_name,
                  api_url: instForm.api_url,
                  api_key: instForm.api_key,
                  phone_number: instForm.phone_number || undefined,
                })}
                disabled={createInstance.isPending || !instForm.name || !instForm.instance_name || !instForm.api_url || !instForm.api_key}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Adicionar Instância
              </Button>
              {createInstance.isError && (
                <p className="text-xs text-red-500">Erro ao criar instância. Verifique os dados.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attendants */}
        <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base dark:text-zinc-100">Atendentes / Gerentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
      </div>

      {/* Webhook info */}
      <Card className="border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm">
        <CardContent className="py-4">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Como configurar o Webhook na Evolution API</p>
          <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">Configure a URL abaixo na sua instância para cada atendente:</p>
          <code className="block bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-900/40 rounded-lg px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 font-mono">
            POST http://SEU_IP:8000/webhook/&#123;instance_name&#125;
          </code>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            Eventos obrigatórios: <strong>messages.upsert</strong>, <strong>messages.update</strong>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
