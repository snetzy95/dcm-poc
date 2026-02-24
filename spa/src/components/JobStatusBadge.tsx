const STATUS_STYLES: Record<string, { cls: string; pulse: boolean }> = {
  PENDING:     { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', pulse: false },
  RUNNING:     { cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', pulse: true },
  AGGREGATING: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', pulse: false },
  DONE:        { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', pulse: false },
  FAILED:      { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', pulse: false },
}

export default function JobStatusBadge({ status }: { status: string }) {
  const { cls, pulse } = STATUS_STYLES[status] ?? { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', pulse: false }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 bg-current ${pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}
