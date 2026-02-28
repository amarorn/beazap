import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatResponseTime } from '@/lib/utils'
import type { AttendantMetrics } from '@/types'

interface AttendantsTableProps {
  data: AttendantMetrics[]
}

export function AttendantsTable({ data }: AttendantsTableProps) {
  if (data.length === 0) return null

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
          Performance por Atendente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/80">
                {['Atendente', 'Cargo', 'Conversas', 'Abertas', 'Resolvidas', 'T.M. Resposta', 'Resolução'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {data.map(att => (
                <tr key={att.attendant_id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-semibold text-sm flex-shrink-0">
                        {att.attendant_name[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{att.attendant_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {att.role === 'manager' ? (
                      <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 text-xs">Gerente</Badge>
                    ) : (
                      <Badge className="bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 text-xs">Agente</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{att.total_conversations}</td>
                  <td className="px-5 py-3 text-amber-600 font-medium">{att.open_conversations}</td>
                  <td className="px-5 py-3 text-emerald-600 font-medium">{att.resolved_conversations}</td>
                  <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">{formatResponseTime(att.avg_first_response_seconds)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-zinc-100 dark:bg-zinc-700 rounded-full h-1.5">
                        <div
                          className="bg-emerald-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(att.resolution_rate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{att.resolution_rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
