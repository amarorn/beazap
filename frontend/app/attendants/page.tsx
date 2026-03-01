'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi, attendantsApi, metricsApi } from '@/lib/api'
import { useInstance } from '@/lib/instance-context'
import { formatResponseTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, UserCheck, TrendingUp, Clock, MessageSquare, CheckCircle, Pencil, X, Check } from 'lucide-react'
import type { Attendant } from '@/types'

const roleConfig = {
  manager: { label: 'Gerente', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  agent:   { label: 'Agente',  className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

function avatarColor(role: 'manager' | 'agent') {
  return role === 'manager'
    ? 'from-violet-400 to-violet-600 shadow-violet-500/25'
    : 'from-blue-400 to-blue-600 shadow-blue-500/25'
}

export default function AttendantsPage() {
  const queryClient = useQueryClient()
  const { selectedInstanceId } = useInstance()

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const { data: attendants = [], isLoading } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const { data: attendantMetrics = [] } = useQuery({
    queryKey: ['attendant-metrics', selectedInstanceId],
    queryFn: () => metricsApi.getAttendants(selectedInstanceId),
    refetchInterval: 30_000,
  })

  const [showForm, setShowForm] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(
    selectedInstanceId ? String(selectedInstanceId) : ''
  )
  const [form, setForm] = useState({ name: '', phone: '', email: '', role: 'agent' })

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', role: '' })

  const createMutation = useMutation({
    mutationFn: attendantsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendants-list'] })
      queryClient.invalidateQueries({ queryKey: ['attendant-metrics'] })
      setForm({ name: '', phone: '', email: '', role: 'agent' })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; phone?: string; email?: string; role?: string } }) =>
      attendantsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendants-list'] })
      queryClient.invalidateQueries({ queryKey: ['attendant-metrics'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: attendantsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendants-list'] })
      queryClient.invalidateQueries({ queryKey: ['attendant-metrics'] })
    },
  })

  function startEdit(att: Attendant) {
    setEditingId(att.id)
    setEditForm({ name: att.name, phone: att.phone, email: att.email ?? '', role: att.role })
  }

  function saveEdit(id: number) {
    updateMutation.mutate({ id, data: { ...editForm } })
  }

  const filtered = selectedInstanceId
    ? attendants.filter(a => a.instance_id === selectedInstanceId)
    : attendants

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Atendentes & Gerentes</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cadastro de atendentes e gestores com métricas de performance
          </p>
        </div>
        <Button
          className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 rounded-xl"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Atendente
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
            Novo Atendente
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Instance */}
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="h-9 text-sm rounded-xl">
                <SelectValue placeholder="Instância *" />
              </SelectTrigger>
              <SelectContent>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Role */}
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger className="h-9 text-sm rounded-xl">
                <SelectValue placeholder="Cargo *" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agente</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
              </SelectContent>
            </Select>

            <input
              type="text"
              placeholder="Nome completo *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Telefone (ex: 5511999999999) *"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className={inputClass}
            />
            <input
              type="email"
              placeholder="E-mail (opcional)"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className={`${inputClass} sm:col-span-2`}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl"
              onClick={() => createMutation.mutate({
                name: form.name,
                phone: form.phone,
                email: form.email || undefined,
                role: form.role,
                instance_id: Number(selectedInstance),
              })}
              disabled={createMutation.isPending || !form.name || !form.phone || !selectedInstance}
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Atendente'}
            </Button>
            <Button variant="ghost" className="rounded-xl" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-500 mt-2">
              {(createMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erro ao criar atendente'}
            </p>
          )}
        </div>
      )}

      {/* Summary chips */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[oklch(0.15_0.018_260)] border border-zinc-200/80 dark:border-white/[0.07] text-xs text-zinc-600 dark:text-zinc-400 shadow-sm">
            <UserCheck className="w-3 h-3" />
            <span><strong>{filtered.length}</strong> atendentes</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-800/40 text-xs text-violet-700 dark:text-violet-400 shadow-sm">
            <span><strong>{filtered.filter(a => a.role === 'manager').length}</strong> gerentes</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 text-xs text-blue-700 dark:text-blue-400 shadow-sm">
            <span><strong>{filtered.filter(a => a.role === 'agent').length}</strong> agentes</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm py-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
          </div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Nenhum atendente cadastrado</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Cadastre atendentes e gerentes para acompanhar a performance individual.</p>
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl mt-2"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Cadastrar primeiro atendente
          </Button>
        </div>
      )}

      {/* Attendants grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(att => {
          const role = roleConfig[att.role as keyof typeof roleConfig] ?? roleConfig.agent
          const metrics = attendantMetrics.find(m => m.attendant_name === att.name)
          const isEditing = editingId === att.id

          return (
            <div
              key={att.id}
              className="bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm p-5 flex flex-col gap-4"
            >
              {/* Top row: avatar + info + actions */}
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarColor(att.role as 'manager' | 'agent')} flex items-center justify-center flex-shrink-0 shadow-md select-none`}>
                  <span className="text-white font-bold text-sm">{getInitials(att.name)}</span>
                </div>

                {/* Info or edit form */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Nome"
                          className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-zinc-50 dark:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-full"
                        />
                        <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v }))}>
                          <SelectTrigger className="h-8 text-xs rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">Agente</SelectItem>
                            <SelectItem value="manager">Gerente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Telefone"
                        className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-zinc-50 dark:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-full"
                      />
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="E-mail"
                        className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-zinc-50 dark:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-full"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">{att.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${role.className}`}>
                          {role.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{att.phone}</p>
                      {att.email && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{att.email}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveEdit(att.id)}
                        disabled={updateMutation.isPending}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="Salvar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(att)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(att.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Metrics */}
              {metrics && metrics.total_conversations > 0 ? (
                <div className="space-y-3">
                  {/* KPI grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Total', value: metrics.total_conversations, color: 'text-zinc-800 dark:text-zinc-100' },
                      { label: 'Abertas', value: metrics.open_conversations, color: metrics.open_conversations > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-100' },
                      { label: 'Resolvidas', value: metrics.resolved_conversations, color: 'text-emerald-700 dark:text-emerald-400' },
                      { label: 'Abandonadas', value: metrics.abandoned_conversations, color: metrics.abandoned_conversations > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-100' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-zinc-50 dark:bg-white/[0.04] rounded-xl p-2.5 text-center">
                        <p className={`text-base font-bold leading-tight ${color}`}>{value}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Detail row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-white/[0.04]">
                      <Clock className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {formatResponseTime(metrics.avg_first_response_seconds)}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">1ª resposta</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-white/[0.04]">
                      <TrendingUp className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <div>
                        <p className={`text-xs font-bold ${
                          metrics.resolution_rate >= 70 ? 'text-emerald-700 dark:text-emerald-400'
                          : metrics.resolution_rate >= 40 ? 'text-amber-700 dark:text-amber-400'
                          : 'text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {metrics.resolution_rate.toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Resolução</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-white/[0.04]">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {metrics.total_messages_sent}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Msgs enviadas</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {metrics.total_conversations > 0 && (
                    <div className="space-y-1">
                      <div className="flex h-1 rounded-full overflow-hidden gap-px">
                        {metrics.resolved_conversations > 0 && (
                          <div className="bg-emerald-500" style={{ width: `${(metrics.resolved_conversations / metrics.total_conversations) * 100}%` }} />
                        )}
                        {metrics.open_conversations > 0 && (
                          <div className="bg-amber-400" style={{ width: `${(metrics.open_conversations / metrics.total_conversations) * 100}%` }} />
                        )}
                        {metrics.abandoned_conversations > 0 && (
                          <div className="bg-red-400" style={{ width: `${(metrics.abandoned_conversations / metrics.total_conversations) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] text-xs text-zinc-400 dark:text-zinc-500">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Nenhuma conversa atribuída ainda</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
