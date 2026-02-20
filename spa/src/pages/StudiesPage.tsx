import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchStudies, deleteStudy } from '../api/coreClient'
import StudyTable from '../components/StudyTable'
import ConfirmDialog from '../components/ConfirmDialog'

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

  const inputCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  const pendingDeleteStudy = pendingDeleteOrthancId
    ? data?.items.find(s => s.orthanc_id === pendingDeleteOrthancId)
    : null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Studies</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Modality</label>
          <input className={inputCls} value={modality} onChange={e => { setModality(e.target.value); setPage(1) }} placeholder="CT" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sex</label>
          <select className={inputCls} value={sex} onChange={e => { setSex(e.target.value); setPage(1) }}>
            <option value="">Any</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date from</label>
          <input type="date" className={inputCls} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date to</label>
          <input type="date" className={inputCls} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
          Include deleted
        </label>
      </div>

      {isLoading && <p className="text-gray-400 text-sm">Loading...</p>}
      {isError && <p className="text-red-500 text-sm">Failed to load studies.</p>}

      {data && (
        <>
          <p className="text-sm text-gray-500">{data.total} total studies</p>
          <StudyTable
            studies={data.items}
            onDeleteStudy={id => setPendingDeleteOrthancId(id)}
            deletingOrthancId={deleteMutation.isPending ? pendingDeleteOrthancId : null}
          />
          <div className="flex gap-2 mt-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">Prev</button>
            <span className="px-3 py-1.5 text-sm">Page {page}</span>
            <button disabled={data.items.length < 20} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">Next</button>
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
