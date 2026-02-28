import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'green' | 'blue' | 'yellow' | 'red' | 'purple'
  progress?: number
}

const accentColors = {
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-400',
  purple: 'bg-purple-500',
}

export function KpiCard({ label, value, sub, accent = 'green', progress }: KpiCardProps) {
  return (
    <Card className="border-zinc-100 dark:border-zinc-800 shadow-sm">
      <CardContent className="p-5">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
        {sub && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', accentColors[accent])} />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</span>
          </div>
        )}
        {progress !== undefined && (
          <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-700 rounded-full h-1.5">
            <div
              className={cn('h-1.5 rounded-full', accentColors[accent])}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
