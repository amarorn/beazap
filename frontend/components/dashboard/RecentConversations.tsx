import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatResponseTime, formatDate } from '@/lib/utils'
import type { ConversationDetail } from '@/types'

interface RecentConversationsProps {
  data: ConversationDetail[]
}

const statusConfig = {
  open: { label: 'Aberta', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  resolved: { label: 'Resolvida', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  abandoned: { label: 'Abandonada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
}

export function RecentConversations({ data }: RecentConversationsProps) {
  if (data.length === 0) {
    return (
      <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
        <CardContent className="py-16 text-center">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">Nenhum atendimento ainda.</p>
          <Link href="/settings" className="mt-2 inline-block text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            Configurar instância →
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-zinc-800 dark:text-zinc-200">Atendimentos Recentes</CardTitle>
        <Link href="/conversations" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
          Ver todos →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
          {data.map(conv => {
            const status = statusConfig[conv.status]
            const displayName = conv.contact_name || conv.contact_phone
            return (
              <div key={conv.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm font-medium flex-shrink-0">
                    {displayName[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{displayName}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {conv.attendant_name || 'Sem atendente'} · {formatDate(conv.opened_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">1ª resposta</p>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{formatResponseTime(conv.first_response_time_seconds)}</p>
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden md:block">
                    {conv.inbound_count + conv.outbound_count} msgs
                  </span>
                  <Badge className={`text-xs ${status.className}`}>{status.label}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
