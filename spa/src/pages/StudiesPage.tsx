import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchStudies, deleteStudy } from '../api/coreClient'
import StudyTable from '../components/StudyTable'
import ConfirmDialog from '../components/ConfirmDialog'
import { Database } from 'lucide-react'

export default function StudiesPage() {
  const qc = useQueryClient()
  const [modality, setModality] = useState('')
  const [sex, setSex] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [pendingDeleteOrthancId, setPendingDeleteOrthancId] = useState<string | null>(null)

  const params: Record<string, string | number> = { page, page_size: 20 }
  if (modality) params.modality = modality
  if (sex) params.patient_sex = sex
  if (dateFrom) params.study_date_from = dateFrom
  if (dateTo) params.study_date_to = dateTo
  if (includeDeleted) params.include_deleted = 'true'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['studies', params],
    queryFn: () => fetchStudies(params),
  })

  const deleteMutation = useMutation({
    mutationFn: (orthancId: string) => deleteStudy(orthancId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studies'] })
    },
  })

  const inputCls = 'border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 hover:border-slate-400 dark:hover:border-slate-500 transition-all duration-200'

  const pendingDeleteStudy = pendingDeleteOrthancId
    ? data?.items.find(s => s.orthanc_id === pendingDeleteOrthancId)
    : null

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Database className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          Studies
        </h1>
      </div>

      {/* Filter Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Modality</label>
            <input className={inputCls} value={modality} onChange={e => { setModality(e.target.value); setPage(1) }} placeholder="CT" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Sex</label>
            <select className={inputCls} value={sex} onChange={e => { setSex(e.target.value); setPage(1) }}>
              <option value="">Any</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date from</label>
            <input type="date" className={inputCls} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date to</label>
            <input type="date" className={inputCls} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer pb-2">
            <input type="checkbox" className="rounded" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
            Include deleted
          </label>
        </div>
      </div>

      {isLoading && <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>}
      {isError && <p className="text-rose-500 text-sm">Failed to load studies.</p>}

      {data && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">{data.total} total studies</p>
          {/* Table Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
            <StudyTable
              studies={data.items}
              onDeleteStudy={id => setPendingDeleteOrthancId(id)}
              deletingOrthancId={deleteMutation.isPending ? pendingDeleteOrthancId : null}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 transition-all duration-200 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Page {page}</span>
            <button
              disabled={data.items.length < 20}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 transition-all duration-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}

      {pendingDeleteOrthancId && pendingDeleteStudy && (
        <ConfirmDialog
          title="Delete Study from Orthanc?"
          message={`Delete "${pendingDeleteStudy.patient_name ?? pendingDeleteStudy.patient_id ?? pendingDeleteStudy.study_uid}"? The study will be removed from Orthanc and soft-deleted in the database within ~30 seconds.`}
          onConfirm={() => { deleteMutation.mutate(pendingDeleteOrthancId); setPendingDeleteOrthancId(null) }}
          onCancel={() => setPendingDeleteOrthancId(null)}
        />
      )}
    </div>
  )
}
