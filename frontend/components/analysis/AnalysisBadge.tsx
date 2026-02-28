import type { ConversationDetail } from '@/types'

const categoryConfig: Record<string, { label: string; className: string }> = {
  reclamacao:       { label: 'Reclamação',       className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  problema_tecnico: { label: 'Prob. Técnico',    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  nova_contratacao: { label: 'Nova Contratação', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  suporte:          { label: 'Suporte',          className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  elogio:           { label: 'Elogio',           className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  informacao:       { label: 'Informação',       className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' },
  outro:            { label: 'Outro',            className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' },
}

const sentimentConfig: Record<string, { label: string; dot: string }> = {
  positivo: { label: 'Positivo', dot: 'bg-emerald-500' },
  neutro:   { label: 'Neutro',  dot: 'bg-zinc-400' },
  negativo: { label: 'Negativo', dot: 'bg-red-500' },
}

interface AnalysisBadgeProps {
  conv: ConversationDetail
  compact?: boolean
}

export function AnalysisBadge({ conv, compact = false }: AnalysisBadgeProps) {
  if (!conv.analysis_category) return null

  const cat = categoryConfig[conv.analysis_category] ?? categoryConfig.outro
  const sent = conv.analysis_sentiment ? sentimentConfig[conv.analysis_sentiment] : null

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cat.className}`}>
          {cat.label}
        </span>
        {conv.analysis_satisfaction && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {'★'.repeat(conv.analysis_satisfaction)}{'☆'.repeat(5 - conv.analysis_satisfaction)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Análise IA</p>
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cat.className}`}>
          {cat.label}
        </span>
        {sent && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
            <span className={`w-2 h-2 rounded-full ${sent.dot}`} />
            {sent.label}
          </span>
        )}
        {conv.analysis_satisfaction && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
            {'★'.repeat(conv.analysis_satisfaction)}{'☆'.repeat(5 - conv.analysis_satisfaction)}
            <span className="ml-1">{conv.analysis_satisfaction}/5</span>
          </span>
        )}
      </div>
      {conv.analysis_summary && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{conv.analysis_summary}</p>
      )}
    </div>
  )
}
