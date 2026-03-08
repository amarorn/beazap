'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instancesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, RefreshCw, Wifi, WifiOff, AlertCircle, Pencil, QrCode, X, Mail, CheckCircle2, Smartphone } from 'lucide-react'
import type { Instance } from '@/types'

const QR_REFRESH_INTERVAL = 30_000 // 30s — QR expira em ~45s
const STATUS_CHECK_INTERVAL = 5_000 // 5s — verifica se conectou

function toQrDataUrl(value: string): string {
  if (!value?.trim()) return ''
  const s = value.trim()
  if (s.startsWith('data:')) return s
  return `data:image/png;base64,${s}`
}

function QrCodeModal({
  instanceId,
  instanceName,
  initialQrcode,
  onClose,
  onConnected,
}: {
  instanceId: number
  instanceName: string
  initialQrcode: string
  onClose: () => void
  onConnected?: () => void
}) {
  const [qrcode, setQrcode] = useState(() => toQrDataUrl(initialQrcode))
  const [imgError, setImgError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [countdown, setCountdown] = useState(QR_REFRESH_INTERVAL / 1000)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchQr = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await instancesApi.getQrCode(instanceId)
      if (result.qrcode) {
        setQrcode(toQrDataUrl(result.qrcode))
        setImgError(false)
        setCountdown(QR_REFRESH_INTERVAL / 1000)
      }
    } catch {
      // QR indisponível — pode já estar conectado
    } finally {
      setRefreshing(false)
    }
  }, [instanceId])

  // Auto-refresh do QR Code
  useEffect(() => {
    if (connected) return
    intervalRef.current = setInterval(fetchQr, QR_REFRESH_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchQr, connected])

  // Countdown visual
  useEffect(() => {
    if (connected) return
    const tick = setInterval(() => {
      setCountdown(c => (c > 1 ? c - 1 : QR_REFRESH_INTERVAL / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [connected])

  // Verifica status de conexão
  useEffect(() => {
    if (connected) return
    const check = setInterval(async () => {
      try {
        const status = await instancesApi.checkStatus(instanceId)
        if (status.state === 'open') {
          setConnected(true)
          if (intervalRef.current) clearInterval(intervalRef.current)
          onConnected?.()
          setTimeout(onClose, 2500)
        }
      } catch { /* ignore */ }
    }, STATUS_CHECK_INTERVAL)
    return () => clearInterval(check)
  }, [instanceId, connected, onClose, onConnected])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center gap-4">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {connected ? 'WhatsApp Conectado!' : 'Conectar WhatsApp'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{instanceName}</p>
        </div>

        {connected ? (
          <div className="w-64 h-64 rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 flex flex-col items-center justify-center gap-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Conectado com sucesso</p>
          </div>
        ) : (
          <div className="relative">
            {imgError || !qrcode ? (
              <div className="w-64 h-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle className="w-10 h-10 text-amber-500" />
                <p className="text-xs text-center text-zinc-600 dark:text-zinc-400">
                  QR Code indisponível ou imagem inválida. Tente atualizar.
                </p>
              </div>
            ) : (
              <img
                src={qrcode}
                alt="QR Code WhatsApp"
                className={`w-64 h-64 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-opacity ${refreshing ? 'opacity-40' : ''}`}
                onError={() => setImgError(true)}
              />
            )}
            {refreshing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin" />
              </div>
            )}
          </div>
        )}

        {!connected && (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Atualiza em {countdown}s
              </p>
              <button
                onClick={fetchQr}
                disabled={refreshing}
                className="text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                Atualizar agora
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
              Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

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

type UpdateResult = { evolution_created?: boolean; evolution_error?: string; qrcode?: string | null }
function InstanceCard({ inst, onDelete, onUpdate }: { inst: Instance; onDelete: () => void; onUpdate: (data: { name?: string; api_url?: string; api_key?: string; phone_number?: string; owner_email?: string }) => Promise<UpdateResult | void> }) {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{ state: string; error?: string; api_url?: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: inst.name,
    api_url: inst.api_url,
    api_key: inst.api_key,
    phone_number: inst.phone_number ?? '',
    owner_email: inst.owner_email ?? '',
  })
  const [qrModal, setQrModal] = useState<{ qrcode: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [updateEvolutionResult, setUpdateEvolutionResult] = useState<UpdateResult | null>(null)

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

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

  async function handleShowQr() {
    setQrLoading(true)
    setQrError(null)
    try {
      const result = await instancesApi.getQrCode(inst.id)
      setQrModal({ qrcode: toQrDataUrl(result.qrcode) })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Não foi possível obter o QR Code.'
      setQrError(msg)
    } finally {
      setQrLoading(false)
    }
  }

  async function handleSendEmail() {
    setEmailSending(true)
    setEmailResult(null)
    try {
      const res = await instancesApi.sendQrCodeEmail(inst.id)
      setEmailResult({ ok: true, msg: `QR enviado para ${res.email}` })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Falha ao enviar email.'
      setEmailResult({ ok: false, msg })
    } finally {
      setEmailSending(false)
    }
  }

  async function handleSave() {
    setUpdateEvolutionResult(null)
    try {
      const result = await onUpdate({
        name: editForm.name || undefined,
        api_url: editForm.api_url || undefined,
        api_key: editForm.api_key || undefined,
        phone_number: editForm.phone_number || undefined,
        owner_email: editForm.owner_email,
      })
      setEditing(false)
      if (result) setUpdateEvolutionResult(result)
    } catch {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-2">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Editando: <span className="font-mono text-zinc-700 dark:text-zinc-300">{inst.instance_name}</span>
        </p>
        {([
          { key: 'name', placeholder: 'Nome (ex: Suporte)', type: 'text' },
          { key: 'api_url', placeholder: 'URL da API', type: 'text' },
          { key: 'api_key', placeholder: 'API Key', type: 'text' },
          { key: 'phone_number', placeholder: 'Telefone (opcional)', type: 'text' },
          { key: 'owner_email', placeholder: 'Email do responsável (opcional)', type: 'email' },
        ] as const).map(({ key, placeholder, type }) => (
          <input
            key={key}
            type={type}
            placeholder={placeholder}
            value={editForm[key]}
            onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
            className={inputClass}
          />
        ))}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleSave}
            disabled={!editForm.name || !editForm.api_url || !editForm.api_key}
          >
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {qrModal && (
        <QrCodeModal
          instanceId={inst.id}
          instanceName={inst.instance_name}
          initialQrcode={qrModal.qrcode}
          onClose={() => setQrModal(null)}
          onConnected={() => setStatus({ state: 'open' })}
        />
      )}
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
              onClick={handleShowQr}
              disabled={qrLoading}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              title="Ver QR Code"
            >
              <QrCode className={`w-3.5 h-3.5 ${qrLoading ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={handleSendEmail}
              disabled={emailSending || !inst.owner_email}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={inst.owner_email ? `Reenviar QR por email para ${inst.owner_email}` : 'Sem email cadastrado'}
            >
              <Mail className={`w-3.5 h-3.5 ${emailSending ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={() => { setEditing(true); setUpdateEvolutionResult(null) }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              title="Editar instância"
            >
              <Pencil className="w-3.5 h-3.5" />
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
        {qrError && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-2.5 py-1.5">
            {qrError}
          </p>
        )}
        {emailResult && (
          <p className={`text-[11px] rounded-lg px-2.5 py-1.5 flex items-center gap-1 ${emailResult.ok ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10' : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10'}`}>
            <Mail className="w-3 h-3 flex-shrink-0" />
            {emailResult.msg}
          </p>
        )}
        {updateEvolutionResult && (
          <div className="space-y-1">
            {updateEvolutionResult.evolution_created && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                Instância criada/atualizada na Evolution API.
              </p>
            )}
            {updateEvolutionResult.evolution_error && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>Evolution API: {updateEvolutionResult.evolution_error}</span>
              </p>
            )}
            {updateEvolutionResult.qrcode && (
              <button
                type="button"
                onClick={() => setQrModal({ qrcode: toQrDataUrl(updateEvolutionResult.qrcode!) })}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <QrCode className="w-3 h-3" /> Ver QR Code
              </button>
            )}
          </div>
        )}
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
    </>
  )
}

export default function InstancesPage() {
  const queryClient = useQueryClient()

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const [instForm, setInstForm] = useState({
    name: '', instance_name: '', api_url: '', api_key: '', phone_number: '', owner_email: '',
  })
  const [newInstQrcode, setNewInstQrcode] = useState<{ instanceId: number; instanceName: string; qrcode: string } | null>(null)

  const createInstance = useMutation({
    mutationFn: instancesApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setInstForm({ name: '', instance_name: '', api_url: '', api_key: '', phone_number: '', owner_email: '' })
      if (data.qrcode) {
        setNewInstQrcode({ instanceId: data.id, instanceName: data.instance_name, qrcode: data.qrcode })
      }
    },
  })

  const updateInstance = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; api_url?: string; api_key?: string; phone_number?: string; owner_email?: string } }) =>
      instancesApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instances'] }),
  })

  const deleteInstance = useMutation({
    mutationFn: instancesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instances'] }),
  })

  const inputClass = "w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"

  return (
    <>
      {newInstQrcode && (
        <QrCodeModal
          instanceId={newInstQrcode.instanceId}
          instanceName={newInstQrcode.instanceName}
          initialQrcode={newInstQrcode.qrcode}
          onClose={() => setNewInstQrcode(null)}
        />
      )}

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" />
            Instâncias WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {instances.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">Nenhuma instância cadastrada.</p>
          )}
          {instances.map(inst => (
            <InstanceCard
              key={inst.id}
              inst={inst}
              onDelete={() => deleteInstance.mutate(inst.id)}
              onUpdate={data => updateInstance.mutateAsync({ id: inst.id, data })}
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
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="email"
                placeholder="Email para receber o QR Code (opcional)"
                value={instForm.owner_email}
                onChange={e => setInstForm(f => ({ ...f, owner_email: e.target.value }))}
                className={`${inputClass} pl-8`}
              />
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => createInstance.mutate({
                name: instForm.name,
                instance_name: instForm.instance_name,
                api_url: instForm.api_url,
                api_key: instForm.api_key,
                phone_number: instForm.phone_number || undefined,
                owner_email: instForm.owner_email || undefined,
              })}
              disabled={createInstance.isPending || !instForm.name || !instForm.instance_name || !instForm.api_url || !instForm.api_key}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {createInstance.isPending ? 'Criando...' : 'Adicionar Instância'}
            </Button>
            {createInstance.isError && (
              <p className="text-xs text-red-500">
                {(createInstance.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erro ao criar instância. Verifique os dados.'}
              </p>
            )}
            {createInstance.isSuccess && (
              <div className="space-y-1.5 pt-1">
                {createInstance.data?.evolution_created ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    Instância criada na Evolution API com sucesso.
                  </p>
                ) : createInstance.data?.evolution_error ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>Evolution API: {createInstance.data.evolution_error}</span>
                  </p>
                ) : null}
                {!createInstance.data?.qrcode && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    QR Code não disponível. Clique em <QrCode className="inline w-3 h-3 mx-0.5" /> na instância para tentar novamente.
                  </p>
                )}
                {createInstance.data?.email_sent === true && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 flex-shrink-0" /> QR Code enviado por email com sucesso.
                  </p>
                )}
                {createInstance.data?.email_sent === false && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 flex-shrink-0" /> Falha ao enviar email. Verifique as configurações SMTP.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
