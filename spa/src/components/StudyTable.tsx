import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Study, fetchStudyLabels, addStudyLabel, removeStudyLabel } from '../api/coreClient'

interface Props {
  studies: Study[]
  onDeleteStudy: (orthancId: string) => void
  deletingOrthancId: string | null
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  )
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
    <div className="p-3 bg-gray-50 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Labels</p>

      {isLoading && <p className="text-xs text-gray-400">Loading labels...</p>}

      <div className="flex flex-wrap gap-1.5">
        {labels.map(label => (
          <span
            key={label}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 font-medium"
          >
            {label}
            <button
              onClick={() => removeMutation.mutate(label)}
              disabled={removeMutation.isPending}
              className="hover:text-red-600 disabled:opacity-40 leading-none"
              title={`Remove label "${label}"`}
            >
              ×
            </button>
          </span>
        ))}
        {!isLoading && labels.length === 0 && (
          <span className="text-xs text-gray-400 italic">No labels</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={e => { setNewLabel(e.target.value); setValidationError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="new-label"
          className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim() || addMutation.isPending}
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {addMutation.isPending ? '...' : '+ Add'}
        </button>
      </div>
      {validationError && <p className="text-xs text-red-500">{validationError}</p>}
    </div>
  )
}

const COLS = 10  // chevron + 8 data cols + trash

export default function StudyTable({ studies, onDeleteStudy, deletingOrthancId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (studies.length === 0) return <p className="text-gray-500 text-sm">No studies found.</p>

  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-2 py-2 w-6"></th>{/* chevron */}
            {['Patient', 'Sex', 'Study Date', 'Description', 'Institution', 'Series', 'Instances', 'Status'].map(h => (
              <th key={h} className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
            ))}
            <th className="px-2 py-2 w-8"></th>{/* trash */}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {studies.map(s => {
            const isExpanded = expandedId === s.id
            const isDeleted = s.deleted_at !== null
            const isDeleting = deletingOrthancId === s.orthanc_id

            return (
              <>
                <tr
                  key={s.id}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className={`cursor-pointer ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'} ${isDeleted ? 'opacity-60' : ''}`}
                >
                  {/* Chevron */}
                  <td className="px-2 py-2 text-gray-400">
                    <ChevronIcon open={isExpanded} />
                  </td>

                  <td className="px-3 py-2 font-mono text-xs">{s.patient_name ?? s.patient_id ?? '—'}</td>
                  <td className="px-3 py-2">{s.patient_sex ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.study_date ?? '—'}</td>
                  <td className="px-3 py-2">{s.study_description ?? '—'}</td>
                  <td className="px-3 py-2">{s.institution_name ?? '—'}</td>
                  <td className="px-3 py-2 text-center">{s.num_series}</td>
                  <td className="px-3 py-2 text-center">{s.num_instances}</td>
                  <td className="px-3 py-2">
                    {isDeleted
                      ? <span className="inline-block px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Deleted</span>
                      : <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">Active</span>}
                  </td>

                  {/* Trash */}
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    {!isDeleted && (
                      <button
                        onClick={() => onDeleteStudy(s.orthanc_id)}
                        disabled={isDeleting}
                        className="text-gray-400 hover:text-red-500 p-1 rounded disabled:opacity-40"
                        title="Delete study from Orthanc"
                      >
                        {isDeleting
                          ? <span className="text-xs">...</span>
                          : <TrashIcon />}
                      </button>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${s.id}-expand`}>
                    <td colSpan={COLS} className="border-t border-blue-100">
                      <div className="px-4 py-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* Study detail */}
                        <div className="text-xs text-gray-600 space-y-1">
                          <p><strong>Study UID:</strong> <code className="break-all">{s.study_uid}</code></p>
                          <p><strong>Orthanc ID:</strong> <code>{s.orthanc_id}</code></p>
                          <p><strong>Ingested:</strong> {new Date(s.ingested_at).toLocaleString()}</p>
                          {s.deleted_at && <p><strong>Deleted:</strong> {new Date(s.deleted_at).toLocaleString()}</p>}
                          {s.series.length > 0 && (
                            <div>
                              <p className="font-semibold mt-1">Series:</p>
                              <ul className="ml-3 list-disc space-y-0.5">
                                {s.series.map(sr => (
                                  <li key={sr.id}>
                                    {sr.modality ?? '?'} — {sr.series_description ?? sr.series_uid} ({sr.num_instances} inst)
                                    {sr.body_part_examined && <span className="text-gray-400"> [{sr.body_part_examined}]</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Labels panel — only for non-deleted studies */}
                        {!isDeleted
                          ? <StudyLabelsPanel orthancId={s.orthanc_id} />
                          : <div className="text-xs text-gray-400 italic p-3">Labels unavailable — study deleted from Orthanc.</div>
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
