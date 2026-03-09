'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useInstance } from '@/lib/instance-context'
import { insightsApi } from '@/lib/api'
import type {
  EmergingTopicsResult,
  MetricAnomaliesResult,
  SentimentAnomaliesResult,
  ChurnPredictionResult,
} from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  AlertTriangle,
  Activity,
  UserMinus,
  Sparkles,
  Loader2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0]
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const CATEGORIES = [
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'problema_tecnico', label: 'Problema Técnico' },
  { value: 'nova_contratacao', label: 'Nova Contratação' },
  { value: 'suporte', label: 'Suporte' },
  { value: 'elogio', label: 'Elogio' },
  { value: 'informacao', label: 'Informação' },
  { value: 'outro', label: 'Outro' },
]

const inputClass =
  'w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500'

const selectClass =
  'text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'

// ── sub-components ──────────────────────────────────────────────────────────

function DateRange({
  inicio,
  fim,
  onInicio,
  onFim,
}: {
  inicio: string
  fim: string
  onInicio: (v: string) => void
  onFim: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Data início</label>
        <input type="date" value={inicio} onChange={e => onInicio(e.target.value)} className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Data fim</label>
        <input type="date" value={fim} onChange={e => onFim(e.target.value)} className={inputClass} />
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      {message}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-600">
      <Sparkles className="w-8 h-8 mb-3 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

// ── Tab: Tópicos Emergentes ──────────────────────────────────────────────────

function TopicsTab({ instanceId }: { instanceId?: number }) {
  const [inicio, setInicio] = useState(daysAgo(7))
  const [fim, setFim] = useState(today())
  const [expanded, setExpanded] = useState<number | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      insightsApi.getEmergingTopics({
        data_inicio: inicio,
        data_fim: fim,
        ...(instanceId ? { instance_id: instanceId } : {}),
      }),
  })

  const data = mutation.data as EmergingTopicsResult | undefined

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Identifica tópicos e temas emergentes nos resumos das conversas do período, comparando com as categorias
        existentes.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Analisar
        </Button>
      </div>

      {mutation.isError && (
        <ErrorBox message="Não foi possível analisar tópicos emergentes. Verifique se há conversas analisadas no período." />
      )}

      {data && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {data.topicos_emergentes.length} tópico(s) identificado(s) · {data.periodo.inicio} até {data.periodo.fim}
          </p>
          {data.topicos_emergentes.length === 0 ? (
            <EmptyState label="Nenhum tópico emergente encontrado no período." />
          ) : (
            data.topicos_emergentes.map((t, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{t.nome}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{t.descricao}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t.exemplos_resumos.length} exemplo(s)
                    </span>
                    {expanded === i ? (
                      <ChevronUp className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                </button>

                {expanded === i && t.exemplos_resumos.length > 0 && (
                  <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-3 space-y-2">
                    <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                      Exemplos de conversas
                    </p>
                    {t.exemplos_resumos.map((ex, j) => (
                      <div
                        key={j}
                        className="flex gap-2 text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-100 dark:border-zinc-700"
                      >
                        <BookOpen className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-zinc-400" />
                        {ex}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <EmptyState label="Configure o período e clique em Analisar para identificar tópicos emergentes." />
      )}
    </div>
  )
}

// ── Tab: Anomalias de Métricas ───────────────────────────────────────────────

function MetricAnomaliesTab({ instanceId }: { instanceId?: number }) {
  const [inicio, setInicio] = useState(daysAgo(7))
  const [fim, setFim] = useState(today())
  const [categoria, setCategoria] = useState('reclamacao')

  const mutation = useMutation({
    mutationFn: () =>
      insightsApi.getMetricAnomalies({
        data_inicio: inicio,
        data_fim: fim,
        categoria,
        ...(instanceId ? { instance_id: instanceId } : {}),
      }),
  })

  const data = mutation.data as MetricAnomaliesResult | undefined

  function MetricRow({
    label,
    atual,
    historico,
    suffix = '',
  }: {
    label: string
    atual: number
    historico: number
    suffix?: string
  }) {
    const diff = historico > 0 ? ((atual - historico) / historico) * 100 : 0
    const up = diff > 0
    return (
      <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700/50 last:border-0">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Histórico: {historico.toFixed(1)}{suffix}
          </span>
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {atual.toFixed(1)}{suffix}
          </span>
          {diff !== 0 && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-xs font-medium',
                up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
              )}
            >
              {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(diff).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Compara métricas do período selecionado com o histórico das 4 semanas anteriores para detectar desvios
        significativos.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Categoria</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className={selectClass}>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
          Analisar
        </Button>
      </div>

      {mutation.isError && (
        <ErrorBox message="Não foi possível analisar anomalias. Verifique se há dados analisados para a categoria no período." />
      )}

      {data && (
        <div className="space-y-4">
          {/* Tabela de métricas */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Comparativo · {CATEGORIES.find(c => c.value === data.categoria)?.label ?? data.categoria}
              </p>
            </div>
            <div className="px-4">
              <MetricRow
                label="Volume de Conversas"
                atual={data.metricas_atual.volume}
                historico={data.metricas_historico.volume}
              />
              <MetricRow
                label="Satisfação Média"
                atual={data.metricas_atual.satisfaction}
                historico={data.metricas_historico.satisfaction}
                suffix="/5"
              />
              <MetricRow
                label="Taxa de Resolução"
                atual={data.metricas_atual.resolution_rate}
                historico={data.metricas_historico.resolution_rate}
                suffix="%"
              />
              <MetricRow
                label="Tempo Médio de Resposta"
                atual={Math.round(data.metricas_atual.avg_response_seconds)}
                historico={Math.round(data.metricas_historico.avg_response_seconds)}
                suffix="s"
              />
            </div>
          </div>

          {/* Anomalias detectadas */}
          {data.anomalias.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Nenhuma anomalia significativa detectada no período.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {data.anomalias.length} anomalia(s) detectada(s)
              </p>
              {data.anomalias.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border px-4 py-3 space-y-1.5',
                    a.tipo === 'pico'
                      ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10'
                      : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        a.tipo === 'pico'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    />
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {a.metrica}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
                        a.tipo === 'pico'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                      )}
                    >
                      {a.tipo === 'pico' ? 'Pico' : 'Queda'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{a.descricao}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">{a.sugestao_causa_impacto}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <EmptyState label="Selecione uma categoria e período, depois clique em Analisar." />
      )}
    </div>
  )
}

// ── Tab: Anomalias de Sentimento ─────────────────────────────────────────────

function SentimentAnomaliesTab({ instanceId }: { instanceId?: number }) {
  const [inicio, setInicio] = useState(daysAgo(7))
  const [fim, setFim] = useState(today())
  const [contexto, setContexto] = useState('')
  const [tipo, setTipo] = useState<'topico' | 'atendente'>('topico')

  const mutation = useMutation({
    mutationFn: () =>
      insightsApi.getSentimentAnomalies({
        data_inicio: inicio,
        data_fim: fim,
        contexto: contexto.trim(),
        tipo,
        ...(instanceId ? { instance_id: instanceId } : {}),
      }),
  })

  const data = mutation.data as SentimentAnomaliesResult | undefined

  function SentimentBar({ label, atual, historico, color }: { label: string; atual: number; historico: number; color: string }) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>{label}</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{atual}%</span>
        </div>
        <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
          <div className={cn('absolute inset-y-0 left-0 rounded-full opacity-30', color)} style={{ width: `${historico}%` }} />
          <div className={cn('absolute inset-y-0 left-0 rounded-full', color)} style={{ width: `${atual}%` }} />
        </div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Histórico: {historico}%</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Detecta mudanças anômalas na distribuição de sentimentos (positivo/neutro/negativo) para um tópico ou atendente
        específico.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value as 'topico' | 'atendente')}
            className={selectClass}
          >
            <option value="topico">Tópico / Categoria</option>
            <option value="atendente">Atendente</option>
          </select>
        </div>
        <div className="space-y-1 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {tipo === 'topico' ? 'Nome da categoria' : 'Nome do atendente'}
          </label>
          <input
            type="text"
            value={contexto}
            onChange={e => setContexto(e.target.value)}
            placeholder={tipo === 'topico' ? 'ex: reclamacao' : 'ex: João Silva'}
            className={inputClass}
          />
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !contexto.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
          Analisar
        </Button>
      </div>

      {mutation.isError && (
        <ErrorBox message="Não foi possível analisar anomalias de sentimento. Verifique se o contexto está correto e há dados suficientes no período." />
      )}

      {data && (
        <div className="space-y-4">
          {/* Barras de sentimento */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Distribuição de Sentimentos · {data.contexto}
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <SentimentBar
                label="Positivo"
                atual={data.distribuicao_atual.positivo}
                historico={data.distribuicao_historica.positivo}
                color="bg-emerald-500"
              />
              <SentimentBar
                label="Neutro"
                atual={data.distribuicao_atual.neutro}
                historico={data.distribuicao_historica.neutro}
                color="bg-zinc-400"
              />
              <SentimentBar
                label="Negativo"
                atual={data.distribuicao_atual.negativo}
                historico={data.distribuicao_historica.negativo}
                color="bg-red-500"
              />
            </div>
          </div>

          {/* Anomalias */}
          {data.anomalias_sentimento.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Distribuição de sentimentos dentro do padrão histórico.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {data.anomalias_sentimento.length} anomalia(s)
              </p>
              {data.anomalias_sentimento.map((a, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{a.mudanca_sentimento}</span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{a.descricao}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">{a.implicacao_sugerida}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <EmptyState label="Informe o contexto e período, depois clique em Analisar." />
      )}
    </div>
  )
}

// ── Tab: Previsão de Churn ───────────────────────────────────────────────────

function ChurnTab({ instanceId }: { instanceId?: number }) {
  const [inicio, setInicio] = useState(daysAgo(30))
  const [fim, setFim] = useState(today())
  const [phone, setPhone] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      insightsApi.predictChurn({
        numero_cliente: phone.trim(),
        data_inicio: inicio,
        data_fim: fim,
        ...(instanceId ? { instance_id: instanceId } : {}),
      }),
  })

  const data = mutation.data as ChurnPredictionResult | undefined

  const riskColor = {
    Baixo: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50',
    Medio: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50',
    Alto: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50',
  }

  const riskLabel = {
    Baixo: 'Risco Baixo',
    Medio: 'Risco Médio',
    Alto: 'Risco Alto',
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Avalia o risco de churn (cancelamento) de um cliente com base no histórico de interações, sentimento e
        satisfação no período.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Telefone do cliente</label>
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="ex: 5511999990000"
            className={inputClass}
          />
        </div>
        <DateRange inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !phone.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserMinus className="w-4 h-4 mr-2" />}
          Avaliar
        </Button>
      </div>

      {mutation.isError && (
        <ErrorBox message="Não foi possível avaliar o risco de churn. Verifique se há conversas para este número no período." />
      )}

      {data && (
        <div className="space-y-4">
          {/* Card de risco */}
          <div className={cn('rounded-xl border px-5 py-4 flex items-center gap-4', riskColor[data.risco_churn])}>
            <UserMinus className="w-8 h-8 flex-shrink-0 opacity-70" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Previsão de Churn</p>
              <p className="text-2xl font-bold">{riskLabel[data.risco_churn]}</p>
              <p className="text-xs opacity-70 mt-0.5">
                {data.periodo.inicio} até {data.periodo.fim} · {data.cliente_id}
              </p>
            </div>
          </div>

          {/* Métricas utilizadas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Conversas', value: data.metricas_utilizadas.total_conversas },
              { label: 'Resolvidas', value: data.metricas_utilizadas.conversas_resolvidas },
              { label: 'Abandonadas', value: data.metricas_utilizadas.conversas_abandonadas },
              {
                label: 'Última interação',
                value: `${data.metricas_utilizadas.ultima_interacao_dias}d atrás`,
              },
            ].map(m => (
              <div
                key={m.label}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-center"
              >
                <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{m.value}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Razões */}
          {data.razoes.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Razões identificadas
                </p>
              </div>
              <ul className="px-4 py-3 space-y-2">
                {data.razoes.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ações sugeridas */}
          {data.acoes_sugeridas.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Ações sugeridas para retenção
                </p>
              </div>
              <ul className="px-4 py-3 space-y-2">
                {data.acoes_sugeridas.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!data && !mutation.isPending && !mutation.isError && (
        <EmptyState label="Informe o telefone do cliente e o período para avaliar o risco de churn." />
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'topics' | 'metrics' | 'sentiment' | 'churn'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'topics', label: 'Tópicos Emergentes', icon: TrendingUp },
  { id: 'metrics', label: 'Anomalias de Métricas', icon: Activity },
  { id: 'sentiment', label: 'Anomalias de Sentimento', icon: AlertTriangle },
  { id: 'churn', label: 'Previsão de Churn', icon: UserMinus },
]

export default function InsightsPage() {
  const { selectedInstanceId } = useInstance()
  const [activeTab, setActiveTab] = useState<TabId>('topics')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-emerald-500" />
          Insights com IA
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Análises avançadas com LLM: tendências, anomalias e previsões para o seu atendimento.
        </p>
      </div>

      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        {/* Tabs */}
        <div className="border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex overflow-x-auto px-4 gap-1 pt-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap',
                  activeTab === id
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <CardContent className="pt-5">
          {activeTab === 'topics' && <TopicsTab instanceId={selectedInstanceId} />}
          {activeTab === 'metrics' && <MetricAnomaliesTab instanceId={selectedInstanceId} />}
          {activeTab === 'sentiment' && <SentimentAnomaliesTab instanceId={selectedInstanceId} />}
          {activeTab === 'churn' && <ChurnTab instanceId={selectedInstanceId} />}
        </CardContent>
      </Card>
    </div>
  )
}
