import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Study, fetchStudyLabels, addStudyLabel, removeStudyLabel } from '../api/coreClient'
import { Trash2, ChevronRight, Plus, X } from 'lucide-react'

interface Props {
  studies: Study[]
  onDeleteStudy: (orthancId: string) => void
  deletingOrthancId: string | null
}

const LABEL_REGEX = /^[a-zA-Z0-9_-]{1,64}$/

function StudyLabelsPanel({ orthancId }: { orthancId: string }) {
  const qc = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [validationError, setValidationError] = useState('')

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['study-labels', orthancId],
    queryFn: () => fetchStudyLabels(orthancId),
  })

  const addMutation = useMutation({
    mutationFn: (label: string) => addStudyLabel(orthancId, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-labels', orthancId] })
      setNewLabel('')
      setValidationError('')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (label: string) => removeStudyLabel(orthancId, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-labels', orthancId] })
    },
  })

  function handleAdd() {
    const trimmed = newLabel.trim()
    if (!LABEL_REGEX.test(trimmed)) {
      setValidationError('Only letters, digits, _ and - are allowed (max 64 chars)')
      return
    }
    setValidationError('')
    addMutation.mutate(trimmed)
  }

  return (
    <div className="p-4 bg-teal-50/30 dark:bg-teal-900/20 space-y-2">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Labels</p>

      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Loading labels...</p>}

      <div className="flex flex-wrap gap-1.5">
        {labels.map(label => (
          <span
            key={label}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 font-medium hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors duration-150"
          >
            {label}
            <button
              onClick={() => removeMutation.mutate(label)}
              disabled={removeMutation.isPending}
              className="hover:text-rose-500 disabled:opacity-40 leading-none transition-colors duration-150"
              title={`Remove label "${label}"`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!isLoading && labels.length === 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic">No labels</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={e => { setNewLabel(e.target.value); setValidationError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="new-label"
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 hover:border-slate-400 dark:hover:border-slate-500 transition-all duration-200 w-40"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim() || addMutation.isPending}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-all duration-200"
        >
          <Plus className="h-3 w-3" />
          {addMutation.isPending ? '...' : 'Add'}
        </button>
      </div>
      {validationError && <p className="text-xs text-rose-500">{validationError}</p>}
    </div>
  )
}

const COLS = 10  // chevron + 8 data cols + trash

export default function StudyTable({ studies, onDeleteStudy, deletingOrthancId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (studies.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No studies found</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try adjusting your filters</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <th className="px-2 py-3 w-6"></th>{/* chevron */}
            {['Patient', 'Sex', 'Study Date', 'Description', 'Institution', 'Series', 'Instances', 'Status'].map(h => (
              <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
            <th className="px-2 py-3 w-8"></th>{/* trash */}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {studies.map(s => {
            const isExpanded = expandedId === s.id
            const isDeleted = s.deleted_at !== null
            const isDeleting = deletingOrthancId === s.orthanc_id

            return (
              <>
                <tr
                  key={s.id}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className={`cursor-pointer transition-colors duration-150 ${isExpanded ? 'bg-teal-50 dark:bg-teal-900/20 border-l-2 border-l-teal-500' : 'hover:bg-teal-50/50 dark:hover:bg-teal-900/10'} ${isDeleted ? 'opacity-60' : ''}`}
                >
                  {/* Chevron */}
                  <td className="px-2 py-3 text-slate-400 dark:text-slate-500">
                    <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </td>

                  <td className="px-3 py-3">
                    <code className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{s.patient_name ?? s.patient_id ?? '—'}</code>
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.patient_sex ?? '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{s.study_date ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.study_description ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.institution_name ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{s.num_series}</td>
                  <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{s.num_instances}</td>
                  <td className="px-3 py-3">
                    {isDeleted
                      ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Deleted</span>
                      : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</span>}
                  </td>

                  {/* Trash */}
                  <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                    {!isDeleted && (
                      <button
                        onClick={() => onDeleteStudy(s.orthanc_id)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 disabled:opacity-40"
                        title="Delete study from Orthanc"
                      >
                        {isDeleting
                          ? <span className="text-xs">...</span>
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${s.id}-expand`}>
                    <td colSpan={COLS} className="border-t border-teal-100 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-900/20">
                      <div className="px-4 py-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Study detail */}
                        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                          <p><strong className="text-slate-700 dark:text-slate-200">Study UID:</strong> <code className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded break-all">{s.study_uid}</code></p>
                          <p><strong className="text-slate-700 dark:text-slate-200">Orthanc ID:</strong> <code className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{s.orthanc_id}</code></p>
                          <p><strong className="text-slate-700 dark:text-slate-200">Ingested:</strong> {new Date(s.ingested_at).toLocaleString()}</p>
                          {s.deleted_at && <p><strong className="text-slate-700 dark:text-slate-200">Deleted:</strong> {new Date(s.deleted_at).toLocaleString()}</p>}
                          {s.series.length > 0 && (
                            <div>
                              <p className="font-semibold text-slate-700 dark:text-slate-200 mt-2 mb-1">Series:</p>
                              <ul className="ml-3 list-disc space-y-0.5 text-slate-600 dark:text-slate-300">
                                {s.series.map(sr => (
                                  <li key={sr.id}>
                                    {sr.modality ?? '?'} — {sr.series_description ?? sr.series_uid} ({sr.num_instances} inst)
                                    {sr.body_part_examined && <span className="text-slate-400 dark:text-slate-500"> [{sr.body_part_examined}]</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Labels panel — only for non-deleted studies */}
                        {!isDeleted
                          ? <StudyLabelsPanel orthancId={s.orthanc_id} />
                          : <div className="text-xs text-slate-400 dark:text-slate-500 italic p-3">Labels unavailable — study deleted from Orthanc.</div>
                        }
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
