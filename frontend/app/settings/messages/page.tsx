'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { quickRepliesApi, instancesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Zap, GripVertical, MessageSquare, Bot } from 'lucide-react'

export default function MessagesPage() {
  const queryClient = useQueryClient()

  const { data: quickReplies = [] } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: quickRepliesApi.list,
  })

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
  })

  const [qrForm, setQrForm] = useState({ title: '', text: '' })
  const [editingQr, setEditingQr] = useState<{ id: number; title: string; text: string } | null>(null)

  // Auto initial message state (per instance)
  const [autoMsgForm, setAutoMsgForm] = useState({ instance_id: '', message: '', enabled: true })

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
      {/* Auto Initial Message */}
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base dark:text-zinc-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            Mensagem Inicial Automática
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Configure uma mensagem enviada automaticamente quando um novo contato iniciar uma conversa.
          </p>
          <div className="space-y-2.5">
            <Select value={autoMsgForm.instance_id} onValueChange={v => setAutoMsgForm(f => ({ ...f, instance_id: v }))}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <textarea
              placeholder="Olá! Bem-vindo. Em breve um atendente irá te ajudar. 😊"
              value={autoMsgForm.message}
              onChange={e => setAutoMsgForm(f => ({ ...f, message: e.target.value }))}
              rows={4}
              className={`${inputClass} resize-none`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoMsgForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  autoMsgForm.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  autoMsgForm.enabled ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {autoMsgForm.enabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!autoMsgForm.instance_id || !autoMsgForm.message.trim()}
              onClick={() => {
                // TODO: persist via API when backend endpoint is ready
                alert('Funcionalidade em implementação — configuração salva localmente.')
              }}
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Salvar Mensagem Inicial
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  )
}
