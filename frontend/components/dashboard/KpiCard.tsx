import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'green' | 'blue' | 'yellow' | 'red' | 'purple'
  progress?: number
  change?: number
}

const accentConfig = {
  green:  { bar: 'bg-emerald-500', border: 'border-l-emerald-500', dot: 'bg-emerald-500', glow: 'shadow-emerald-500/10' },
  blue:   { bar: 'bg-blue-500',    border: 'border-l-blue-500',    dot: 'bg-blue-500',    glow: 'shadow-blue-500/10' },
  yellow: { bar: 'bg-amber-400',   border: 'border-l-amber-400',   dot: 'bg-amber-400',   glow: 'shadow-amber-400/10' },
  red:    { bar: 'bg-red-400',     border: 'border-l-red-500',     dot: 'bg-red-400',     glow: 'shadow-red-500/10' },
  purple: { bar: 'bg-purple-500',  border: 'border-l-purple-500',  dot: 'bg-purple-500',  glow: 'shadow-purple-500/10' },
}

function ChangeBadge({ change }: { change: number }) {
  if (change === 0) return null
  const isPositive = change > 0
  return (
    <span
      className={cn(
        'ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
        isPositive
          ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15'
          : 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15'
      )}
    >
      {isPositive ? '▲' : '▼'} {Math.abs(change)}%
    </span>
  )
}

export function KpiCard({ label, value, sub, accent = 'green', progress, change }: KpiCardProps) {
  const cfg = accentConfig[accent]
  return (
    <div className={cn(
      'relative bg-white dark:bg-[oklch(0.15_0.018_260)] rounded-xl border border-zinc-200/80 dark:border-white/[0.07]',
      'border-l-4', cfg.border,
      'shadow-sm hover:shadow-md dark:shadow-none dark:hover:bg-[oklch(0.17_0.018_260)]',
      'transition-all duration-200 p-5 group'
    )}>
      {/* Label */}
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</p>

      {/* Value */}
      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mt-2 flex items-baseline leading-none">
        {value}
        {change !== undefined && <ChangeBadge change={change} />}
      </p>

      {/* Sub */}
      {sub && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{sub}</span>
        </div>
      )}

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="mt-3 w-full bg-zinc-100 dark:bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
          <div
            className={cn('h-1.5 rounded-full transition-all duration-500', cfg.bar)}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
