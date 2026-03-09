'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useInstance } from '@/lib/instance-context'
import { metricsApi } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Contact as ContactIcon, Phone, Loader2, Pencil, Trash2, X } from 'lucide-react'
import type { Contact as ContactType } from '@/types'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string | null, phone: string) {
  if (name?.trim()) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return (phone || '??').slice(-2)
}

/** Numero para exibir na coluna Telefone: prioriza JID de envio (@s.whatsapp.net), senao indica LID. */
function getDisplayPhone(c: ContactType): { text: string; isLid: boolean; title?: string } {
  if (c.contact_send_jid && c.contact_send_jid.endsWith('@s.whatsapp.net')) {
    const num = c.contact_send_jid.replace('@s.whatsapp.net', '').trim()
    return { text: num || '—', isLid: false }
  }
  if (c.contact_jid && c.contact_jid.endsWith('@lid')) {
    const id = (c.contact_phone || c.contact_jid.replace('@lid', '')).trim()
    return {
      text: id ? `LID (${id})` : 'LID',
      isLid: true,
      title: 'Identificador do chat (WhatsApp não envia o número em contatos LID). Edite o contato e preencha o telefone se souber.',
    }
  }
  return { text: c.contact_phone || '—', isLid: false }
}

export default function ContactsPage() {
  const queryClient = useQueryClient()
  const { selectedInstanceId } = useInstance()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ contact_name: '', contact_phone: '', contact_send_jid: '' })

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', selectedInstanceId],
    queryFn: () =>
      metricsApi.getContacts({
        instance_id: selectedInstanceId ?? undefined,
        limit: 500,
      }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { contact_name?: string; contact_phone?: string; contact_send_jid?: string } }) =>
      metricsApi.updateContact(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: metricsApi.deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditingId(null)
    },
  })

  function startEdit(c: ContactType) {
    setEditingId(c.id)
    setEditForm({
      contact_name: c.contact_name ?? '',
      contact_phone: c.contact_phone ?? '',
      contact_send_jid: c.contact_send_jid ?? '',
    })
  }

  function saveEdit(id: number) {
    updateMutation.mutate({
      id,
      data: {
        contact_name: editForm.contact_name.trim() || undefined,
        contact_phone: editForm.contact_phone.trim() || undefined,
        contact_send_jid: editForm.contact_send_jid.trim() || undefined,
      },
    })
  }

  function confirmDelete(c: ContactType) {
    if (typeof window === 'undefined') return
    const label = c.contact_name || c.contact_phone || `Contato #${c.id}`
    if (window.confirm(`Remover o contato "${label}" da base?`)) {
      deleteMutation.mutate(c.id)
    }
  }

  const inputClass = 'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Contatos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Base de clientes que entraram em contato e foram salvos pelos atendentes. Em contatos LID o número real só aparece se a Evolution enviar remoteJidAlt no webhook; senão, edite o contato e preencha o telefone manualmente.
          </p>
        </div>
      </div>

      {editingId !== null && (
        <Card className="border-sky-200 dark:border-sky-800 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Editar contato</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Nome"
                value={editForm.contact_name}
                onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Telefone"
                value={editForm.contact_phone}
                onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="JID envio (ex: 5511999999999@s.whatsapp.net)"
                value={editForm.contact_send_jid}
                onChange={e => setEditForm(f => ({ ...f, contact_send_jid: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="bg-sky-500 hover:bg-sky-600 text-white"
                onClick={() => editingId && saveEdit(editingId)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 dark:text-zinc-400">
              <ContactIcon className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhum contato cadastrado ainda.</p>
              <p className="text-xs mt-1">Os contatos aparecem aqui quando um atendente clica em &quot;Salvar contato&quot; na conversa.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/30">
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">Contato</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">Telefone</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">JID envio</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">Instância</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">Primeiro contato</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400">Último contato</th>
                    <th className="text-right py-3 px-4 font-medium text-zinc-600 dark:text-zinc-400 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c: ContactType) => (
                    <tr
                      key={c.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {c.contact_avatar_url ? (
                            <img
                              src={c.contact_avatar_url}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {getInitials(c.contact_name, c.contact_phone)}
                            </div>
                          )}
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {c.contact_name || c.contact_phone || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {(() => {
                          const { text, isLid, title } = getDisplayPhone(c)
                          return (
                            <span
                              className="inline-flex items-center gap-1"
                              title={title}
                            >
                              <Phone className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                              <span className={isLid ? 'text-amber-600 dark:text-amber-400' : ''}>
                                {text}
                              </span>
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-500 dark:text-zinc-450 max-w-[180px] truncate" title={c.contact_send_jid || undefined}>
                        {c.contact_send_jid || '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {c.instance_name || '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 dark:text-zinc-450 whitespace-nowrap">
                        {formatDate(c.first_seen_at)}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 dark:text-zinc-450 whitespace-nowrap">
                        {formatDate(c.last_seen_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500 hover:text-sky-600"
                            onClick={() => startEdit(c)}
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500 hover:text-red-600"
                            onClick={() => confirmDelete(c)}
                            disabled={deleteMutation.isPending}
                            title="Excluir"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
