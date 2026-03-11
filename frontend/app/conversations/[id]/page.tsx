'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useEffect, useState, useCallback } from 'react'
import { metricsApi, attendantsApi, quickRepliesApi, translationApi } from '@/lib/api'
import { formatResponseTime, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Phone, User, Clock, CheckCircle, Sparkles, Send, Lock,
  CalendarDays, Users, Zap, StickyNote, Trash2, Plus, X, Loader2, Globe,
  Copy, ExternalLink, UserPlus, ChevronDown, ChevronRight,
} from 'lucide-react'
import { AnalysisBadge } from '@/components/analysis/AnalysisBadge'
import { cn } from '@/lib/utils'

type Suggestion = { text: string; tone_used: string; adaptation_reason: string }

const IDIOMA_NOMES: Record<string, string> = {
  pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês',
  de: 'Alemão', it: 'Italiano', ja: 'Japonês', zh: 'Chinês', ar: 'Árabe',
}

const statusConfig = {
  open:      { label: 'Aberta',     pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   dot: 'bg-amber-400' },
  resolved:  { label: 'Resolvida',  pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-400' },
  abandoned: { label: 'Abandonada', pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           dot: 'bg-red-400' },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function getInitials(name?: string | null, phone?: string) {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return (phone ?? '??').slice(-2)
}

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = Number(params.id)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const qrPickerRef = useRef<HTMLDivElement>(null)
  const lastFetchedMsgIdRef = useRef<number | null>(null)

  const [text, setText] = useState('')
  const [showQrPicker, setShowQrPicker] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showContextSummaries, setShowContextSummaries] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendJidInput, setSendJidInput] = useState('')

  // Suggestion state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false)

  // Translation state
  const [messageTranslations, setMessageTranslations] = useState<Map<number, { idioma: string; texto: string }>>(new Map())
  const [translatingOutgoing, setTranslatingOutgoing] = useState(false)
  const lastTranslatedMsgIdRef = useRef<number | null>(null)

  const { data: conversation, isLoading: loadingConv } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => metricsApi.getConversation(id),
    enabled: !!id,
  })

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['messages', id],
    queryFn: () => metricsApi.getMessages(id),
    enabled: !!id,
    refetchInterval: conversation?.status === 'open' ? 5000 : false,
  })

  const { data: quickReplies = [] } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => quickRepliesApi.list(),
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', id],
    queryFn: () => metricsApi.getNotes(id),
    enabled: showNotes && !!id,
  })

  const { data: contextSummaries = [] } = useQuery({
    queryKey: ['context-summaries', id],
    queryFn: () => metricsApi.getContextSummaries(id),
    enabled: !!id,
  })

  const { data: contactStatus } = useQuery({
    queryKey: ['contact-status', id],
    queryFn: () => metricsApi.getConversationContactStatus(id),
    enabled: !!id && !!conversation && !conversation.is_group,
  })

  const resolveMutation = useMutation({
    mutationFn: metricsApi.resolveConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      queryClient.invalidateQueries({ queryKey: ['notes', id] })
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: metricsApi.analyzeConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversation', id] }),
  })

  const { data: attendants = [] } = useQuery({
    queryKey: ['attendants-list'],
    queryFn: () => attendantsApi.list(),
  })

  const assignMutation = useMutation({
    mutationFn: ({ attendant_id }: { attendant_id: number | null }) =>
      metricsApi.assignConversation(id, attendant_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['sla-alerts'] })
    },
  })

  const sendMutation = useMutation({
    mutationFn: (t: string) => metricsApi.sendMessage(id, t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', id] })
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      setText('')
      textareaRef.current?.focus()
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: () => metricsApi.addNote(id, noteText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', id] })
      setNoteText('')
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => metricsApi.deleteNote(id, noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', id] }),
  })

  const setSendJidMutation = useMutation({
    mutationFn: (send_jid: string) => metricsApi.setConversationSendJid(id, send_jid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      sendMutation.reset()
      setSendJidInput('')
    },
  })

  const [contactSaveSuccess, setContactSaveSuccess] = useState(false)
  const saveContactMutation = useMutation({
    mutationFn: () => metricsApi.saveContactFromConversation(id),
    onSuccess: () => {
      setContactSaveSuccess(true)
      setTimeout(() => setContactSaveSuccess(false), 2500)
      queryClient.invalidateQueries({ queryKey: ['contact-status', id] })
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
    },
  })

  // Close QR picker on outside click
  useEffect(() => {
    if (!showQrPicker) return
    function handleClick(e: MouseEvent) {
      if (qrPickerRef.current && !qrPickerRef.current.contains(e.target as Node)) {
        setShowQrPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showQrPicker])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-fetch suggestion + auto-translate when client sends a new message
  useEffect(() => {
    if (conversation?.status !== 'open') return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.direction !== 'inbound' || !lastMsg.content) return
    if (lastMsg.id === lastFetchedMsgIdRef.current) return

    lastFetchedMsgIdRef.current = lastMsg.id
    setDismissedSuggestions(false)
    setSuggestions([])
    setSuggestionsLoading(true)

    const companyTone = (typeof window !== 'undefined' && localStorage.getItem('company_tone')) || ''
    metricsApi.getSuggestions(id, companyTone)
      .then(sug => setSuggestions(sug))
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false))
  }, [messages, id, conversation?.status])

  // Auto-translate new inbound messages
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.direction !== 'inbound' || !lastMsg.content) return
    if (lastMsg.id === lastTranslatedMsgIdRef.current) return
    if (messageTranslations.has(lastMsg.id)) return

    lastTranslatedMsgIdRef.current = lastMsg.id

    translationApi.translateIncoming({ texto_original: lastMsg.content, conversation_id: id })
      .then(result => {
        if (result.texto_traduzido) {
          setMessageTranslations(prev => new Map(prev).set(lastMsg.id, {
            idioma: result.idioma_detectado,
            texto: result.texto_traduzido!,
          }))
        }
      })
      .catch(() => {})
  }, [messages, id])

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || sendMutation.isPending) return
    sendMutation.mutate(trimmed)
  }, [text, sendMutation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleTranslateAndSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || translatingOutgoing || sendMutation.isPending) return
    const clientLang = conversation?.client_language
    if (!clientLang || clientLang === 'pt') {
      sendMutation.mutate(trimmed)
      return
    }
    setTranslatingOutgoing(true)
    try {
      const result = await translationApi.translateOutgoing({
        texto_original: trimmed,
        idioma_destino: IDIOMA_NOMES[clientLang] ?? clientLang,
      })
      sendMutation.mutate(result.texto_traduzido ?? trimmed)
    } catch {
      sendMutation.mutate(trimmed)
    } finally {
      setTranslatingOutgoing(false)
    }
  }, [text, translatingOutgoing, sendMutation, conversation?.client_language])

  const handleUseSuggestion = useCallback((suggText: string) => {
    setText(suggText)
    setDismissedSuggestions(true)
    setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
      }
    }, 0)
  }, [])

  if (loadingConv) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Carregando conversa...
      </div>
    )
  }
  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
        Conversa não encontrada.
      </div>
    )
  }

  const status = statusConfig[conversation.status as keyof typeof statusConfig]
  const isOpen = conversation.status === 'open'
  const activeQr = quickReplies.filter(qr => qr.active)
  const showSuggestionPanel = isOpen && (suggestionsLoading || (suggestions.length > 0 && !dismissedSuggestions))

  // Group messages by day
  const grouped: { day: string; items: typeof messages }[] = []
  for (const msg of messages) {
    const day = formatDay(msg.timestamp)
    const last = grouped[grouped.length - 1]
    if (!last || last.day !== day) grouped.push({ day, items: [msg] })
    else last.items.push(msg)
  }

  return (
    <div
      className={cn(
        'flex gap-4 h-full w-full p-6 transition-[max-width] duration-300 overflow-hidden',
        showSuggestionPanel ? 'max-w-5xl' : 'max-w-3xl'
      )}
    >
      {/* ── Main chat column ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Header do Chat (estilo AtendimentoModerno) ── */}
        <div className="h-16 border-b border-zinc-200 dark:border-zinc-700 px-6 flex items-center justify-between bg-white dark:bg-zinc-900 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-emerald-500/20">
              {getInitials(conversation.contact_name, conversation.contact_phone)}
            </div>
            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50 truncate leading-tight">
                {conversation.contact_name || conversation.contact_phone}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${status.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${isOpen ? 'animate-pulse' : ''}`} />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{conversation.contact_phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-3 text-xs gap-1.5 rounded-xl transition-colors ${
                showNotes
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
              }`}
              onClick={() => setShowNotes(v => !v)}
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Notas{notes.length > 0 && showNotes ? ` (${notes.length})` : ''}</span>
            </Button>

            {!conversation.analysis_category && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs gap-1.5 text-zinc-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl"
                onClick={() => analyzeMutation.mutate(conversation.id)}
                disabled={analyzeMutation.isPending}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {analyzeMutation.isPending ? 'Analisando...' : 'Analisar'}
              </Button>
            )}
            {isOpen && (
              <Button
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 rounded-xl border-0"
                onClick={() => resolveMutation.mutate(conversation.id)}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Resolver
              </Button>
            )}
          </div>
        </div>

        {/* ── Info chips ── */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5 flex-shrink-0 scrollbar-hide">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[oklch(0.15_0.018_260)] border border-zinc-200/80 dark:border-white/[0.07] text-xs text-zinc-600 dark:text-zinc-400 flex-shrink-0 shadow-sm">
            <User className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
            <Select
              value={conversation.attendant_name
                ? String(attendants.find(a => a.name === conversation.attendant_name)?.id ?? '')
                : 'none'}
              onValueChange={v => assignMutation.mutate({ attendant_id: v === 'none' ? null : Number(v) })}
              disabled={assignMutation.isPending}
            >
              <SelectTrigger className="h-auto p-0 border-0 bg-transparent shadow-none gap-1 focus:ring-0 w-auto min-w-[90px] text-xs font-medium">
                <SelectValue placeholder="Sem atendente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem atendente</SelectItem>
                {attendants.map(att => (
                  <SelectItem key={att.id} value={String(att.id)}>{att.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[oklch(0.15_0.018_260)] border border-zinc-200/80 dark:border-white/[0.07] text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0 shadow-sm whitespace-nowrap">
            <Phone className="w-3 h-3" />
            <span>{conversation.inbound_count}↓ {conversation.outbound_count}↑</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[oklch(0.15_0.018_260)] border border-zinc-200/80 dark:border-white/[0.07] text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0 shadow-sm whitespace-nowrap">
            <Clock className="w-3 h-3" />
            <span>{formatResponseTime(conversation.first_response_time_seconds)}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[oklch(0.15_0.018_260)] border border-zinc-200/80 dark:border-white/[0.07] text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0 shadow-sm whitespace-nowrap">
            <CalendarDays className="w-3 h-3" />
            <span>{formatDate(conversation.opened_at)}</span>
          </div>

          {conversation.team_name && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-indigo-700 dark:text-indigo-400 flex-shrink-0 shadow-sm whitespace-nowrap font-medium">
              <Users className="w-3 h-3" />
              <span>{conversation.team_name}</span>
            </div>
          )}
        </div>

        {/* ── Salvar contato (cliente não cadastrado) ── */}
        {conversation && !conversation.is_group && contactStatus && !contactStatus.saved && !contactSaveSuccess && (
          <div className="mb-3 flex-shrink-0 rounded-xl border border-sky-200/60 dark:border-sky-800/40 bg-sky-50/80 dark:bg-sky-900/10 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-sky-700 dark:text-sky-300">Cliente ainda não cadastrado na base de contatos</span>
            <button
              type="button"
              onClick={() => saveContactMutation.mutate()}
              disabled={saveContactMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white shadow-sm"
            >
              {saveContactMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              Salvar contato
            </button>
          </div>
        )}
        {conversation && !conversation.is_group && contactSaveSuccess && (
          <div className="mb-3 flex-shrink-0 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/80 dark:bg-emerald-900/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            Contato salvo na base de contatos
          </div>
        )}

        {/* ── Analysis badge ── */}
        {conversation.analysis_category && (
          <div className="mb-3 flex-shrink-0">
            <AnalysisBadge conv={conversation} />
          </div>
        )}

        {/* ── Contexto: conversas anteriores (recolhido por padrão) ── */}
        {contextSummaries.length > 0 && (
          <div className="mb-3 flex-shrink-0 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/30 bg-indigo-50/80 dark:bg-indigo-900/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowContextSummaries(s => !s)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-indigo-100/50 dark:hover:bg-indigo-800/20 transition-colors"
            >
              {showContextSummaries ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                Contexto: conversas anteriores ({contextSummaries.length})
              </span>
            </button>
            {showContextSummaries && (
              <div className="max-h-24 overflow-y-auto px-4 py-2 space-y-1.5 border-t border-indigo-200/60 dark:border-indigo-800/30">
                {contextSummaries.map((ctx, i) => (
                  <div key={i} className="text-xs text-indigo-900 dark:text-indigo-200 pt-2 first:pt-2">
                    {ctx.resolved_at && <span className="text-indigo-500 dark:text-indigo-500 mr-1.5">{formatDate(ctx.resolved_at)}</span>}
                    <span>{ctx.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Notes panel ── */}
        {showNotes && (
          <div className="mb-3 flex-shrink-0 rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/80 dark:bg-amber-900/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-amber-200/60 dark:border-amber-800/30 flex items-center gap-2">
              <StickyNote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Notas Internas {notes.length > 0 ? `(${notes.length})` : ''}
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto px-4 py-2 space-y-2">
              {notes.length === 0 ? (
                <p className="text-xs text-amber-500/60 dark:text-amber-500/50 text-center py-2 italic">
                  Nenhuma nota ainda — adicione uma abaixo
                </p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="flex items-start gap-2 group py-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{note.author_name}</span>
                        {note.note_type === 'resumo_llm' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-medium">Resumo IA</span>
                        )}
                        <span className="text-[10px] text-amber-500/60 dark:text-amber-600/60">{formatDate(note.created_at)}</span>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">{note.content}</p>
                    </div>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      disabled={deleteNoteMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-amber-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0 mt-0.5"
                      title="Excluir nota"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 pb-3 pt-2 border-t border-amber-200/60 dark:border-amber-800/30">
              <div className="flex gap-2">
                <input
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && noteText.trim()) {
                      e.preventDefault()
                      addNoteMutation.mutate()
                    }
                  }}
                  placeholder="Adicionar nota interna..."
                  className="flex-1 text-xs rounded-xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-amber-900/20 px-3 py-2 text-amber-900 dark:text-amber-200 placeholder:text-amber-400/60 dark:placeholder:text-amber-600/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                />
                <button
                  onClick={() => addNoteMutation.mutate()}
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors flex-shrink-0"
                  title="Adicionar nota"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Chat area ── */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm overflow-hidden bg-[#f0f2f5] dark:bg-[oklch(0.12_0.018_260)]">

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loadingMsgs && (
              <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-10">Carregando mensagens...</p>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <p className="text-center text-zinc-400 dark:text-zinc-500 text-sm py-10">Nenhuma mensagem registrada.</p>
            )}

            {grouped.map(({ day, items }) => (
              <div key={day}>
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 rounded-full text-[11px] font-medium text-zinc-500 dark:text-zinc-400 bg-white/80 dark:bg-white/[0.08] shadow-sm backdrop-blur-sm border border-zinc-200/60 dark:border-white/[0.07]">
                    {day}
                  </span>
                </div>

                <div className="space-y-1">
                  {items.map((msg, idx) => {
                    const isOut = msg.direction === 'outbound'
                    const prevMsg = items[idx - 1]
                    const isSameDirection = prevMsg?.direction === msg.direction
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOut ? 'justify-end' : 'justify-start'} ${isSameDirection ? 'mt-0.5' : 'mt-2'}`}
                      >
                        <div className={`max-w-[72%] px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                          isOut
                            ? 'bg-emerald-500 text-white rounded-2xl rounded-br-sm'
                            : 'bg-white dark:bg-[oklch(0.18_0.018_260)] text-zinc-800 dark:text-zinc-200 rounded-2xl rounded-bl-sm'
                        }`}>
                          {!isOut && msg.sender_name && (
                            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">
                              {msg.sender_name}
                            </p>
                          )}
                          {msg.msg_type !== 'text' && (
                            <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${isOut ? 'text-emerald-100/80' : 'text-zinc-400 dark:text-zinc-500'}`}>
                              {msg.msg_type}
                            </p>
                          )}
                          {msg.content ? (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          ) : (
                            <p className={`italic text-xs ${isOut ? 'text-emerald-100/70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                              (mídia sem texto)
                            </p>
                          )}
                          {/* Translation for inbound foreign messages */}
                          {!isOut && messageTranslations.has(msg.id) && (() => {
                            const tr = messageTranslations.get(msg.id)!
                            return (
                              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-600/40">
                                <div className="flex items-center gap-1 mb-1">
                                  <Globe className="w-3 h-3 text-blue-400" />
                                  <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400">
                                    {IDIOMA_NOMES[tr.idioma] ?? tr.idioma.toUpperCase()} → PT
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 italic leading-relaxed">
                                  {tr.texto}
                                </p>
                              </div>
                            )
                          })()}
                          <p className={`text-[10px] mt-1 text-right leading-none ${isOut ? 'text-emerald-100/70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="bg-white dark:bg-[oklch(0.15_0.018_260)] border-t border-zinc-200/60 dark:border-white/[0.06] px-3 py-3">
            {isOpen ? (
              <div className="flex items-end gap-2">

                {/* Quick reply picker */}
                <div ref={qrPickerRef} className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowQrPicker(v => !v)}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                      showQrPicker
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                        : 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    }`}
                    title="Templates de resposta rápida"
                  >
                    <Zap className="w-4 h-4" />
                  </button>

                  {showQrPicker && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[oklch(0.15_0.018_260)] shadow-2xl z-50">
                      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] flex items-center gap-2 sticky top-0 bg-white dark:bg-[oklch(0.15_0.018_260)]">
                        <Zap className="w-3 h-3 text-emerald-500" />
                        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Templates de Resposta</p>
                      </div>
                      {activeQr.length === 0 ? (
                        <p className="px-4 py-4 text-xs text-zinc-400 dark:text-zinc-500 text-center italic">
                          Nenhum template cadastrado.<br />
                          <span className="text-zinc-300 dark:text-zinc-600">Adicione em Configurações.</span>
                        </p>
                      ) : (
                        <div className="py-1">
                          {activeQr.map(qr => (
                            <button
                              key={qr.id}
                              onClick={() => {
                                setText(qr.text)
                                setShowQrPicker(false)
                                setTimeout(() => {
                                  const el = textareaRef.current
                                  if (el) {
                                    el.focus()
                                    el.style.height = 'auto'
                                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
                                  }
                                }, 0)
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors border-b border-zinc-50 dark:border-white/[0.03] last:border-0"
                            >
                              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{qr.title}</p>
                              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{qr.text}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem..."
                  rows={1}
                  disabled={sendMutation.isPending}
                  className="flex-1 resize-none rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-zinc-50 dark:bg-white/[0.05] px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:focus:border-emerald-600 transition-all disabled:opacity-50 leading-snug"
                  style={{ minHeight: '42px', maxHeight: '120px' }}
                />
                {/* Translate-and-send button — only when client speaks a foreign language */}
                {conversation.client_language && conversation.client_language !== 'pt' && (
                  <button
                    type="button"
                    onClick={handleTranslateAndSend}
                    disabled={!text.trim() || translatingOutgoing || sendMutation.isPending}
                    className="flex-shrink-0 w-10 h-10 rounded-2xl bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all duration-150"
                    title={`Traduzir para ${IDIOMA_NOMES[conversation.client_language] ?? conversation.client_language} e enviar`}
                  >
                    {translatingOutgoing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sendMutation.isPending}
                  className="flex-shrink-0 w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all duration-150"
                  title="Enviar (Enter)"
                >
                  {sendMutation.isPending ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1.5 text-zinc-400 dark:text-zinc-500 text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Conversa {status.label.toLowerCase()} — não é possível enviar mensagens</span>
              </div>
            )}

            {sendMutation.isError && (() => {
              const err = sendMutation.error as { response?: { data?: { detail?: string | string[] } } }
              const d = err?.response?.data?.detail
              const msg = typeof d === 'string' ? d : (Array.isArray(d) && d.length ? d[0] : 'Erro ao enviar mensagem')
              const isLidError = typeof msg === 'string' && msg.includes('LID')
              const managerUrl = ''
              return (
                <div className="mt-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-900/10 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-red-700 dark:text-red-300">{msg}</p>
                  {isLidError && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (text.trim()) {
                              navigator.clipboard.writeText(text.trim())
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-white/10 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar mensagem
                        </button>
                        <a
                          href={managerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 dark:bg-red-500/20 border border-red-300/60 dark:border-red-700/50 text-red-700 dark:text-red-300 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Enviar pelo WhatsApp
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-200/60 dark:border-red-800/40">
                        <input
                          type="text"
                          value={sendJidInput}
                          onChange={e => setSendJidInput(e.target.value)}
                          placeholder="Número para envio (ex.: 5511999999999 ou 5511999999999@s.whatsapp.net)"
                          className="flex-1 min-w-[180px] text-xs rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-white/5 px-2.5 py-1.5 text-red-900 dark:text-red-200 placeholder:text-red-400/60"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (sendJidInput.trim()) {
                              setSendJidMutation.mutate(sendJidInput.trim())
                            }
                          }}
                          disabled={!sendJidInput.trim() || setSendJidMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
                        >
                          {setSendJidMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Definir número e enviar por aqui
                        </button>
                      </div>
                      {setSendJidMutation.isSuccess && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Número salvo. Tente enviar a mensagem novamente.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>{/* end main chat column */}

      {/* ── Suggestion panel ── */}
      {showSuggestionPanel && (
        <div className="w-64 flex-shrink-0 flex flex-col gap-3 pt-14 overflow-y-auto">
          <div className="flex items-center gap-1.5 px-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Sugestão IA
            </p>
          </div>

          {/* Loading skeleton */}
          {suggestionsLoading && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 px-4 py-4 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Gerando sugestão...</p>
            </div>
          )}

          {/* Suggestion cards */}
          {!suggestionsLoading && suggestions.map((sug, i) => (
            <div
              key={i}
              className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-zinc-800/60 shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/60 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/40">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Sugestão{suggestions.length > 1 ? ` ${i + 1}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedSuggestions(true)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
                  title="Dispensar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="px-3 py-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {sug.text}
                </p>
                {sug.adaptation_reason && (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 italic leading-relaxed">
                    {sug.adaptation_reason}
                  </p>
                )}
              </div>

              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={() => handleUseSuggestion(sug.text)}
                  className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-sm shadow-emerald-500/20"
                >
                  Usar esta resposta
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
