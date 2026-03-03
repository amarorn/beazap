'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, Play, RefreshCw, CheckCircle2, XCircle, Clock,
  Loader2, Zap, MessageSquare, Eye, EyeOff, Code2, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { databricksApi } from '@/lib/api'
import type { DatabricksJobRun, DatabricksValidation } from '@/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function statusBadge(status: DatabricksJobRun['status']) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:          { label: 'Aguardando', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400', icon: <Clock className="w-3 h-3" /> },
    running:          { label: 'Executando', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    success:          { label: 'Sucesso',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:           { label: 'Falhou',     cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400', icon: <XCircle className="w-3 h-3" /> },
    cancelled:        { label: 'Cancelado',  cls: 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400', icon: <XCircle className="w-3 h-3" /> },
    validation_error: { label: 'Dado inválido', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400', icon: <AlertTriangle className="w-3 h-3" /> },
  }
  const s = map[status] ?? map.pending
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', s.cls)}>{s.icon}{s.label}</span>
}

function sourceBadge(source: string) {
  return source === 'manual'
    ? <Badge variant="outline" className="text-[10px] h-4 px-1.5">manual</Badge>
    : <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-400/50 text-emerald-600 dark:text-emerald-400"><Zap className="w-2.5 h-2.5 mr-0.5" />WhatsApp</Badge>
}

function formatDuration(run: DatabricksJobRun) {
  if (!run.completed_at) return '—'
  const s = Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

function ParamRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.04] last:border-0">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{label}</span>
      <span className={cn('text-xs font-mono px-2 py-0.5 rounded', highlight
        ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold'
        : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300'
      )}>{value}</span>
    </div>
  )
}

// Styled input helper
const inputCls = 'w-full text-sm border border-zinc-200 dark:border-white/[0.08] rounded-lg px-3 py-2 bg-zinc-50 dark:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400'

// ---------------------------------------------------------------------------
// Config Card
// ---------------------------------------------------------------------------

function ConfigCard({ onSaved }: { onSaved: () => void }) {
  const { data: config, isLoading } = useQuery({ queryKey: ['databricks-config'], queryFn: databricksApi.getConfig })
  const qc = useQueryClient()

  const [form, setForm] = useState({
    workspace_url: '', api_token: '', job_id: '', trigger_keyword: '',
    param_catalog: 'nazaria_dev', param_schema_name: 'nazaria_gold',
    param_modo: 'cliente', param_output_path: '/dbfs/FileStore/relatorios/relatorio.pdf',
    client_code_regex: '\\d+',
    client_code_min_length: '', client_code_max_length: '',
    send_error_reply: true, reply_example: '',
  })
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    if (config) setForm(f => ({
      ...f,
      workspace_url: config.workspace_url, job_id: config.job_id,
      trigger_keyword: config.trigger_keyword, param_catalog: config.param_catalog,
      param_schema_name: config.param_schema_name, param_modo: config.param_modo,
      param_output_path: config.param_output_path, client_code_regex: config.client_code_regex,
      client_code_min_length: config.client_code_min_length?.toString() ?? '',
      client_code_max_length: config.client_code_max_length?.toString() ?? '',
      send_error_reply: config.send_error_reply,
      reply_example: config.reply_example ?? '',
      api_token: '',
    }))
  }, [config])

  const save = useMutation({
    mutationFn: () => databricksApi.saveConfig({
      workspace_url: form.workspace_url, api_token: form.api_token, job_id: form.job_id,
      trigger_keyword: form.trigger_keyword, param_catalog: form.param_catalog,
      param_schema_name: form.param_schema_name, param_modo: form.param_modo,
      param_output_path: form.param_output_path, client_code_regex: form.client_code_regex,
      client_code_min_length: form.client_code_min_length ? parseInt(form.client_code_min_length) : null,
      client_code_max_length: form.client_code_max_length ? parseInt(form.client_code_max_length) : null,
      send_error_reply: form.send_error_reply, reply_example: form.reply_example || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['databricks-config'] }); onSaved() },
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  if (isLoading) return <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />Carregando...</CardContent></Card>

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-500" />Configuração Databricks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 flex-1">

        {config && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            Configuração salva · Token: <span className="font-mono">{config.api_token_masked}</span>
          </div>
        )}

        {/* Conexão */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Conexão</p>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Workspace URL</label>
            <input className={inputCls} placeholder="https://adb-xxxx.azuredatabricks.net" value={form.workspace_url} onChange={set('workspace_url')} />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
              API Token{config ? ' (em branco = manter atual)' : ''}
            </label>
            <div className="relative">
              <input className={cn(inputCls, 'pr-9')} type={showToken ? 'text' : 'password'}
                placeholder={config ? '••••••••' : 'dapiXXXXXXXX'} value={form.api_token} onChange={set('api_token')} />
              <button type="button" onClick={() => setShowToken(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Job ID</label>
            <input className={inputCls} placeholder="12345" value={form.job_id} onChange={set('job_id')} />
          </div>
        </div>

        {/* Acionamento */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Acionamento</p>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Keyword de disparo</label>
            <input className={inputCls} placeholder="gerar relatorio" value={form.trigger_keyword} onChange={set('trigger_keyword')} />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
              Regex — extrai <code className="bg-zinc-100 dark:bg-white/10 px-1 rounded">codigo_cliente</code>
            </label>
            <input className={cn(inputCls, 'font-mono')} placeholder="\d+" value={form.client_code_regex} onChange={set('client_code_regex')} />
          </div>
        </div>

        {/* Validação */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" />Validação do código
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Mínimo de dígitos</label>
              <input className={inputCls} type="number" min="1" placeholder="Ex: 4" value={form.client_code_min_length} onChange={set('client_code_min_length')} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Máximo de dígitos</label>
              <input className={inputCls} type="number" min="1" placeholder="Ex: 10" value={form.client_code_max_length} onChange={set('client_code_max_length')} />
            </div>
          </div>
        </div>

        {/* Resposta de erro */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" />Resposta de erro no WhatsApp
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.send_error_reply}
              onChange={e => setForm(p => ({ ...p, send_error_reply: e.target.checked }))}
              className="w-4 h-4 rounded accent-emerald-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-300">Avisar o usuário quando os dados estiverem errados ou faltando</span>
          </label>
          {form.send_error_reply && (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Exemplo na resposta de erro</label>
              <input className={inputCls} placeholder={`${form.trigger_keyword || 'gerar relatorio'} 448427`}
                value={form.reply_example} onChange={set('reply_example')} />
              <p className="text-[10px] text-zinc-400 mt-1">Aparece na mensagem de erro que o usuário recebe no WhatsApp.</p>
            </div>
          )}
        </div>

        {/* Notebook params fixos */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Parâmetros fixos do Notebook</p>
          <div className="grid grid-cols-2 gap-3">
            {([['param_catalog', 'catalog'], ['param_schema_name', 'schema'], ['param_modo', 'modo']] as const).map(([k, l]) => (
              <div key={k}>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1 font-mono">{l}</label>
                <input className={cn(inputCls, 'font-mono text-xs')} value={form[k]} onChange={set(k)} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1 font-mono">output_path</label>
            <input className={cn(inputCls, 'font-mono text-xs')} value={form.param_output_path} onChange={set('param_output_path')} />
          </div>
        </div>

        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => save.mutate()}
          disabled={save.isPending || !form.workspace_url || !form.job_id || !form.trigger_keyword}>
          {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Configuração
        </Button>
        {save.isError && <p className="text-xs text-red-500">Erro: {String((save.error as Error)?.message)}</p>}
        {save.isSuccess && <p className="text-xs text-emerald-600">Salvo com sucesso!</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Trigger + Validation Card
// ---------------------------------------------------------------------------

function TriggerCard({ onTriggered }: { onTriggered: () => void }) {
  const { data: config } = useQuery({ queryKey: ['databricks-config'], queryFn: databricksApi.getConfig })
  const [message, setMessage] = useState('')
  const [phone, setPhone] = useState('5511999999999')
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string; codigo?: string } | null>(null)

  // Live validation via backend
  const validation = useQuery<DatabricksValidation>({
    queryKey: ['databricks-validate', message],
    queryFn: () => databricksApi.validate(message),
    enabled: !!message.trim() && !!config,
    staleTime: 300,
  })
  const v = validation.data

  const trigger = useMutation({
    mutationFn: () => databricksApi.trigger(message, phone),
    onSuccess: (run) => {
      setTriggerResult({ ok: true, msg: 'Job acionado com sucesso!', codigo: run.extracted_codigo_cliente ?? undefined })
      onTriggered()
    },
    onError: (err: { response?: { data?: { detail?: string } }; message?: string }) => {
      setTriggerResult({ ok: false, msg: err?.response?.data?.detail || err?.message || 'Erro desconhecido' })
    },
  })

  const canTrigger = v?.is_valid === true && !trigger.isPending

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />Simular Mensagem WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Telefone (simulado)</label>
          <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">Mensagem</label>
          <textarea
            value={message} onChange={e => { setMessage(e.target.value); setTriggerResult(null) }}
            placeholder={config ? `Ex: ${config.trigger_keyword} 448427` : 'Digite a mensagem...'}
            rows={3}
            className="w-full text-sm border border-zinc-200 dark:border-white/[0.08] rounded-lg px-3 py-2 bg-zinc-50 dark:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-zinc-800 dark:text-zinc-200 resize-none"
          />
        </div>

        {/* Validation feedback */}
        {message.trim() && (
          <div className="space-y-2">
            {validation.isLoading && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="w-3 h-3 animate-spin" />Validando...</div>
            )}

            {v && (
              <div className="space-y-2">
                {/* Step indicators */}
                <div className="space-y-1.5">
                  <StepRow
                    ok={v.keyword_found}
                    label={v.keyword_found ? `Keyword "${config?.trigger_keyword}" detectada` : `Keyword "${config?.trigger_keyword}" não encontrada`}
                  />
                  {v.keyword_found && (
                    <StepRow
                      ok={!!v.codigo_cliente}
                      label={v.codigo_cliente ? `codigo_cliente extraído: ${v.codigo_cliente}` : 'codigo_cliente não encontrado na mensagem'}
                    />
                  )}
                  {v.keyword_found && v.codigo_cliente && (
                    <StepRow
                      ok={v.is_valid}
                      label={v.is_valid ? 'Dados válidos — pronto para disparar' : `Validação falhou: ${v.error_reason}`}
                    />
                  )}
                </div>

                {/* notebook_params preview */}
                {v.is_valid && v.notebook_params && (
                  <div className="rounded-lg border border-zinc-200 dark:border-white/[0.08] overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/[0.06]">
                      <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">notebook_params</span>
                    </div>
                    <div className="px-3 py-1">
                      {Object.entries(v.notebook_params).map(([k, val]) => (
                        <ParamRow key={k} label={k} value={val} highlight={k === 'codigo_cliente'} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error reply preview */}
                {!v.is_valid && v.keyword_found && v.error_reply && (
                  <div className="rounded-lg border border-orange-200 dark:border-orange-500/20 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                        Resposta enviada ao usuário no WhatsApp
                      </span>
                    </div>
                    <div className="px-3 py-3 bg-white dark:bg-zinc-900">
                      <pre className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {v.error_reply}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto pt-2">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            onClick={() => { setTriggerResult(null); trigger.mutate() }}
            disabled={!canTrigger}>
            {trigger.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Acionando...</>
              : <><Play className="w-4 h-4 mr-2" />Disparar Job</>
            }
          </Button>

          {!message.trim() && (
            <p className="text-[11px] text-zinc-400 text-center mt-2">Digite a mensagem acima para validar.</p>
          )}
          {v && !v.is_valid && v.keyword_found && (
            <p className="text-[11px] text-orange-500 dark:text-orange-400 text-center mt-2">
              Corrija os dados antes de disparar.
            </p>
          )}
          {v && !v.keyword_found && message.trim() && (
            <p className="text-[11px] text-zinc-400 text-center mt-2">
              Inclua a keyword <span className="font-mono text-zinc-600 dark:text-zinc-300">"{config?.trigger_keyword}"</span> na mensagem.
            </p>
          )}
        </div>

        {triggerResult && (
          <div className={cn('flex items-start gap-2 p-3 rounded-lg text-sm',
            triggerResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'
          )}>
            {triggerResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <div>
              {triggerResult.msg}
              {triggerResult.codigo && <p className="text-xs mt-0.5 opacity-80">codigo_cliente: <span className="font-mono">{triggerResult.codigo}</span></p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StepRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg',
      ok ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
         : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
    )}>
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      }
      <span>{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Runs Table
// ---------------------------------------------------------------------------

function RunsTable() {
  const qc = useQueryClient()
  const { data: runs = [], isLoading, refetch } = useQuery({
    queryKey: ['databricks-runs'],
    queryFn: () => databricksApi.getRuns(50),
    refetchInterval: 8000,
  })

  const refresh = useMutation({
    mutationFn: (id: number) => databricksApi.refreshRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['databricks-runs'] }),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-zinc-400" />Histórico de Execuções
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 px-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />Carregando...</div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-sm">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhuma execução registrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-white/[0.06]">
                  {['#', 'Origem', 'Telefone', 'Mensagem', 'Cód. Cliente', 'Run ID', 'Status', 'Duração', 'Iniciado', ''].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3 text-zinc-400 text-xs font-mono">{run.id}</td>
                    <td className="px-3 py-3">{sourceBadge(run.trigger_source)}</td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300 text-xs font-mono">{run.triggered_by_phone || '—'}</td>
                    <td className="px-3 py-3 max-w-[160px]">
                      <span className="text-xs text-zinc-500 truncate block" title={run.triggered_by_message || ''}>{run.triggered_by_message || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      {run.extracted_codigo_cliente
                        ? <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">{run.extracted_codigo_cliente}</span>
                        : <span className="text-xs text-zinc-400">—</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {run.databricks_run_id
                        ? <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{run.databricks_run_id}</span>
                        : <span className="text-xs text-zinc-400">—</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(run.status)}
                      {run.error_message && (
                        <p className="text-[10px] text-red-400 mt-0.5 max-w-[150px] truncate" title={run.error_message}>{run.error_message}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{formatDuration(run)}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(run.started_at)}</td>
                    <td className="px-3 py-3">
                      {(run.status === 'running' || run.status === 'pending') && run.databricks_run_id && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                          onClick={() => refresh.mutate(run.id)} disabled={refresh.isPending}>
                          <RefreshCw className={cn('w-3 h-3', refresh.isPending && 'animate-spin')} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DatabricksPage() {
  const qc = useQueryClient()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-500" />Integração Databricks
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Configure e teste o acionamento de jobs via mensagem WhatsApp com validação automática.
        </p>
      </div>

      {/* Fluxo */}
      <div className="flex items-center gap-2 p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/[0.06] text-sm overflow-x-auto">
        {[
          { icon: <Zap className="w-4 h-4" />, label: 'WhatsApp', color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'keyword' },
          { icon: <ShieldCheck className="w-4 h-4" />, label: 'Valida dados', color: 'text-blue-600 dark:text-blue-400' },
          { label: 'ok' },
          { icon: <Database className="w-4 h-4" />, label: 'Databricks Job', color: 'text-violet-600 dark:text-violet-400' },
        ].map((item, i) =>
          item.color ? (
            <div key={i} className={cn('flex items-center gap-1.5 font-medium whitespace-nowrap', item.color)}>
              {item.icon}{item.label}
            </div>
          ) : (
            <div key={i} className="flex items-center gap-1 flex-1 min-w-6">
              <div className="flex-1 border-t border-dashed border-zinc-300 dark:border-white/20" />
              <span className="text-[10px] text-zinc-400 whitespace-nowrap">{item.label}</span>
              <div className="flex-1 border-t border-dashed border-zinc-300 dark:border-white/20" />
            </div>
          )
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="w-6 border-t border-dashed border-zinc-300 dark:border-white/20" />
          <span className="text-[10px] text-orange-500 whitespace-nowrap">erro → reply WhatsApp</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <ConfigCard onSaved={() => qc.invalidateQueries({ queryKey: ['databricks-config'] })} />
        <TriggerCard onTriggered={() => qc.invalidateQueries({ queryKey: ['databricks-runs'] })} />
      </div>

      <RunsTable />
    </div>
  )
}
