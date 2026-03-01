'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi, attendantsApi, quickRepliesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Bell, Zap, GripVertical, RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react'
import type { Instance } from '@/types'

function InstanceStatusBadge({ state, error }: { state: string; error?: string }) {
  if (state === 'open') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
      <Wifi className="w-3 h-3" /> Conectado
    </span>
  )
  if (state === 'connecting') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-semibold animate-pulse">
      <RefreshCw className="w-3 h-3" /> Conectando…
    </span>
  )
  if (state === 'close' || state === 'closed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[11px] font-semibold">
      <WifiOff className="w-3 h-3" /> Desconectado
    </span>
  )
  if (state === 'unreachable') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[11px] font-semibold" title={error}>
      <AlertCircle className="w-3 h-3" /> Inacessível
    </span>
  )
  return null
}

function InstanceCard({ inst, onDelete }: { inst: Instance; onDelete: () => void }) {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{ state: string; error?: string; api_url?: string } | null>(null)

  async function checkStatus() {
    setChecking(true)
    try {
      const result = await instancesApi.checkStatus(inst.id)
      setStatus(result)
    } catch {
      setStatus({ state: 'error', error: 'Falha ao verificar' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{inst.name}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">{inst.instance_name}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {status && <InstanceStatusBadge state={status.state} error={status.error} />}
          <button
            onClick={checkStatus}
            disabled={checking}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title="Verificar conexão"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Remover instância"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {status?.error && status.state !== 'open' && (
        <p className="text-[11px] text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg px-2.5 py-1.5">
          {status.error}
        </p>
      )}
      {status?.api_url && (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono truncate">
          {status.api_url}
        </p>
      )}
    </div>
  )
}

const SLA_THRESHOLD_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const [slaThreshold, setSlaThreshold] = useState(30)
  useEffect(() => {
    const stored = localStorage.getItem('sla_threshold_minutes')
    if (stored) setSlaThreshold(parseInt(stored, 10))
  }, [])

  function handleSlaThresholdChange(value: number) {
    setSlaThreshold(value)
    localStorage.setItem('sla_threshold_minutes', String(value))
    window.dispatchEvent(new Event('sla-threshold-changed'))
    queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
  }

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

  // Quick replies
  const { data: quickReplies = [] } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: quickRepliesApi.list,
  })
  const [qrForm, setQrForm] = useState({ title: '', text: '' })
  const [editingQr, setEditingQr] = useState<{ id: number; title: string; text: string } | null>(null)

  const createQr = useMutation({
    mutationFn: quickRepliesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      setQrForm({ title: '', text: '' })
    },
  })
  const updateQr = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; text?: string } }) =>
      quickRepliesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      setEditingQr(null)
    },
  })
  const deleteQr = useMutation({
    mutationFn: quickRepliesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quick-replies'] }),
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
              <InstanceCard
                key={inst.id}
                inst={inst}
                onDelete={() => deleteInstance.mutate(inst.id)}
              />
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
                <p className="text-xs text-red-500">
                  {(createInstance.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erro ao criar instância. Verifique os dados.'}
                </p>
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

      {/* Quick Replies */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            Templates de Resposta Rápida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quickReplies.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">Nenhum template cadastrado.</p>
          )}
          {quickReplies.map(qr => (
            <div key={qr.id} className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-1">
              {editingQr?.id === qr.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editingQr.title}
                    onChange={e => setEditingQr(q => q ? { ...q, title: e.target.value } : q)}
                    className={inputClass}
                    placeholder="Título"
                  />
                  <textarea
                    value={editingQr.text}
                    onChange={e => setEditingQr(q => q ? { ...q, text: e.target.value } : q)}
                    className={`${inputClass} resize-none`}
                    rows={3}
                    placeholder="Texto do template"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => updateQr.mutate({ id: qr.id, data: { title: editingQr.title, text: editingQr.text } })}
                      disabled={updateQr.isPending || !editingQr.title.trim() || !editingQr.text.trim()}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingQr(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <GripVertical className="w-4 h-4 text-zinc-300 dark:text-zinc-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        {qr.title}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{qr.text}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingQr({ id: qr.id, title: qr.title, text: qr.text })}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteQr.mutate(qr.id)}
                      className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Novo Template</p>
            <input
              type="text"
              placeholder="Título (ex: Saudação inicial)"
              value={qrForm.title}
              onChange={e => setQrForm(f => ({ ...f, title: e.target.value }))}
              className={inputClass}
            />
            <textarea
              placeholder="Texto da resposta rápida..."
              value={qrForm.text}
              onChange={e => setQrForm(f => ({ ...f, text: e.target.value }))}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => createQr.mutate({ title: qrForm.title.trim(), text: qrForm.text.trim() })}
              disabled={createQr.isPending || !qrForm.title.trim() || !qrForm.text.trim()}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SLA Alert Settings */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            Alertas de SLA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Limiar de tempo sem primeira resposta para disparar um alerta.
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                Conversas abertas além deste tempo aparecerão em vermelho no dashboard e no sidebar.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {SLA_THRESHOLD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSlaThresholdChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    slaThreshold === opt.value
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook info */}
      <Card className="border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm">
        <CardContent className="py-4">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Como configurar o Webhook na Evolution API</p>
          <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">Configure a URL abaixo na sua instância para cada atendente:</p>
          <code className="block bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-900/40 rounded-lg px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 font-mono">
            POST http://SEU_IP:8000/webhook/&#123;instance_name&#125;
          </code>
          <div className="mt-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Eventos obrigatórios:</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'GROUPS_UPSERT', 'GROUPS_UPDATE', 'CALL'].map(ev => (
                <span key={ev} className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-[11px] font-mono font-medium">
                  {ev}
                </span>
              ))}
            </div>
            <p className="text-xs text-blue-500 dark:text-blue-500 mt-2">
              Ative todos em <strong>Configurações → Webhook</strong> na Evolution API.
              Sem <strong>MESSAGES_UPSERT</strong> nenhuma conversa será capturada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
