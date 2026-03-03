import { cn } from '@/lib/utils'
import { formatResponseTime } from '@/lib/utils'
import type { AttendantMetrics } from '@/types'

interface AttendantsTableProps {
  data: AttendantMetrics[]
}

export function AttendantsTable({ data }: AttendantsTableProps) {
  if (data.length === 0) return null

  return (
    <div className="bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-xl border border-zinc-200/80 dark:border-white/[0.07] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05]">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Performance por Atendente</h3>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Métricas individuais do período</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-white/[0.05]">
              {['Atendente', 'Cargo', 'Conversas', 'Abertas', 'Resolvidas', 'T.M. Resposta', 'Resolução'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((att, i) => (
              <tr
                key={att.attendant_id}
                className={cn(
                  'hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors',
                  i !== data.length - 1 && 'border-b border-zinc-50 dark:border-white/[0.04]'
                )}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm shadow-emerald-500/20">
                      {att.attendant_name[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{att.attendant_name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {att.role === 'manager' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300">
                      Gerente
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-400">
                      Agente
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100">{att.total_conversations}</td>
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{att.open_conversations}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{att.resolved_conversations}</span>
                </td>
                <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {formatResponseTime(att.avg_first_response_seconds)}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-20 bg-zinc-100 dark:bg-white/[0.07] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(att.resolution_rate, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 tabular-nums w-9">
                      {att.resolution_rate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
