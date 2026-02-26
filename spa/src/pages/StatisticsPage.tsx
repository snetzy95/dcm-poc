import { useQuery } from '@tanstack/react-query'
import { fetchStatistics, type Statistics } from '../api/coreClient'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts'
import { Activity, Database, Layers, RefreshCw, AlertCircle } from 'lucide-react'

// ── Colour palette used across all charts ──────────────────────────────────
const TEAL_SHADES = [
  '#0d9488', // teal-600
  '#0f766e', // teal-700
  '#14b8a6', // teal-500
  '#2dd4bf', // teal-400
  '#5eead4', // teal-300
  '#99f6e4', // teal-200
]

const ACCENT_PALETTE = [
  '#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#10b981',
  '#f97316', '#8b5cf6', '#14b8a6', '#ef4444', '#a3e635',
]

// ── Tiny helpers ────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  colour,
}: {
  icon: React.ElementType
  label: string
  value: number
  colour: string
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6 flex items-center gap-4">
      <div className={`rounded-xl p-3 ${colour}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {empty ? (
        <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm">
          No data available
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// Custom tooltip shared by bar/area charts
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-sm">
      {label && <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-teal-600 dark:text-teal-400">
          {p.name ? `${p.name}: ` : ''}
          <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ── Chart panels ────────────────────────────────────────────────────────────

function ModalityChart({ data }: { data: Statistics['studies_by_modality'] }) {
  return (
    <ChartCard
      title="Studies by Modality"
      subtitle="Count of distinct studies per imaging modality"
      empty={data.length === 0}
    >
      <div className="flex flex-col md:flex-row items-center gap-6">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="modality"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={45}
              paddingAngle={2}
              label={(props: { modality?: string; percent?: number }) =>
                `${props.modality ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={ACCENT_PALETTE[i % ACCENT_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                fontSize: '0.75rem',
              }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

function InstitutionChart({ data }: { data: Statistics['studies_by_institution'] }) {
  return (
    <ChartCard
      title="Top Institutions"
      subtitle="Studies per institution (top 10)"
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis
            dataKey="institution"
            type="category"
            width={130}
            tick={{ fontSize: 11, fill: '#64748b' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function MonthlyTrendChart({ data }: { data: Statistics['studies_by_month'] }) {
  return (
    <ChartCard
      title="Monthly Study Ingestion"
      subtitle="Number of studies by study date (up to last 24 months)"
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="year_month"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            name="Studies"
            stroke="#0d9488"
            strokeWidth={2}
            fill="url(#tealGrad)"
            dot={{ r: 3, fill: '#0d9488' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function SexDistributionChart({ data }: { data: Statistics['sex_distribution'] }) {
  const SEX_COLORS: Record<string, string> = {
    Male: '#0d9488',
    Female: '#ec4899',
    Unknown: '#94a3b8',
  }

  return (
    <ChartCard
      title="Patient Sex Distribution"
      subtitle="Breakdown of studies by patient sex"
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="sex"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            paddingAngle={3}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={SEX_COLORS[entry.sex] ?? ACCENT_PALETTE[i % ACCENT_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
            }}
          />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function BodyPartsChart({ data }: { data: Statistics['body_parts'] }) {
  return (
    <ChartCard
      title="Body Parts Examined"
      subtitle="Series count per body part (top 10)"
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="body_part"
            tick={{ fontSize: 11, fill: '#64748b' }}
            angle={-35}
            textAnchor="end"
          />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={TEAL_SHADES[i % TEAL_SHADES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function InstanceDistributionChart({ data }: { data: Statistics['instance_distribution'] }) {
  // Sort buckets in logical order
  const ORDER = ['1–10', '11–50', '51–100', '101–500', '500+']
  const sorted = [...data].sort(
    (a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket)
  )

  return (
    <ChartCard
      title="Instances per Series"
      subtitle="Distribution of series by their instance count"
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sorted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['statistics'],
    queryFn: fetchStatistics,
    staleTime: 60_000,
  })

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            Statistics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Metadata analytics across all ingested DICOM studies
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800 rounded-xl h-24 animate-pulse border border-slate-100 dark:border-slate-700"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-rose-700 dark:text-rose-400 mb-6">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">
            Failed to load statistics. Make sure the core service is running.
          </span>
        </div>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <KpiCard
              icon={Database}
              label="Total Studies"
              value={data.totals.studies}
              colour="bg-teal-600"
            />
            <KpiCard
              icon={Layers}
              label="Total Series"
              value={data.totals.series}
              colour="bg-indigo-500"
            />
            <KpiCard
              icon={Activity}
              label="Total Instances"
              value={data.totals.instances}
              colour="bg-amber-500"
            />
          </div>

          {/* Row 1: modality + sex */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ModalityChart data={data.studies_by_modality} />
            <SexDistributionChart data={data.sex_distribution} />
          </div>

          {/* Row 2: monthly trend (full width) */}
          <div className="mb-6">
            <MonthlyTrendChart data={data.studies_by_month} />
          </div>

          {/* Row 3: institutions + body parts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <InstitutionChart data={data.studies_by_institution} />
            <BodyPartsChart data={data.body_parts} />
          </div>

          {/* Row 4: instance distribution (full width) */}
          <div>
            <InstanceDistributionChart data={data.instance_distribution} />
          </div>
        </>
      )}
    </div>
  )
}
