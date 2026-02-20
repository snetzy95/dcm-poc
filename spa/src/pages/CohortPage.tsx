import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCohortDefinitions, createCohortDefinition, resolveCohort, fetchMembers,
  deleteCohortDefinition,
  CohortDefinition, OrthancTagCriteria,
} from '../api/mlClient'
import CohortForm from '../components/CohortForm'
import ConfirmDialog from '../components/ConfirmDialog'

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
}

export default function CohortPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<CohortDefinition | null>(null)
  const [resolveResult, setResolveResult] = useState<{ matched_count: number; study_uids: string[] } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ['cohort-definitions'],
    queryFn: fetchCohortDefinitions,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['cohort-members', selected?.cohort_definition_id],
    queryFn: () => fetchMembers(selected!.cohort_definition_id),
    enabled: !!selected,
  })

  const createMutation = useMutation({
    mutationFn: (args: { name: string; filters: Record<string, unknown>; tags: OrthancTagCriteria[] }) =>
      createCohortDefinition({ cohort_definition_name: args.name, cohort_description: null, filters: args.filters, orthanc_tags: args.tags }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cohort-definitions'] }); setShowForm(false) },
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveCohort(id),
    onSuccess: (data) => {
      setResolveResult({ matched_count: data.matched_count, study_uids: data.study_uids })
      qc.invalidateQueries({ queryKey: ['cohort-members', data.cohort_definition_id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCohortDefinition(id),
    onSuccess: (_, id) => {
      if (selected?.cohort_definition_id === id) {
        setSelected(null)
        setResolveResult(null)
      }
      qc.invalidateQueries({ queryKey: ['cohort-definitions'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const pendingDeleteCohort = pendingDeleteId
    ? definitions.find(d => d.cohort_definition_id === pendingDeleteId)
    : null

  return (
    <div className="flex gap-6">
      {/* Left: list */}
      <div className="w-72 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Cohort Definitions</h2>
          <button onClick={() => setShowForm(s => !s)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ New'}
          </button>
        </div>
        {isLoading && <p className="text-gray-400 text-sm">Loading...</p>}
        <ul className="space-y-1">
          {definitions.map(d => (
            <li
              key={d.cohort_definition_id}
              onClick={() => { setSelected(d); setResolveResult(null) }}
              className={`cursor-pointer px-3 py-2 rounded text-sm flex items-center justify-between gap-2 ${selected?.cohort_definition_id === d.cohort_definition_id ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-100'}`}
            >
              <div className="min-w-0">
                <span className="block truncate">{d.cohort_definition_name}</span>
                <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setPendingDeleteId(d.cohort_definition_id) }}
                className="shrink-0 text-gray-400 hover:text-red-500 p-1 rounded"
                title="Delete cohort"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Right: form or detail */}
      <div className="flex-1">
        {showForm && (
          <div className="bg-white rounded border border-gray-200 p-4">
            <h2 className="font-semibold mb-4">New Cohort Definition</h2>
            <CohortForm
              loading={createMutation.isPending}
              onSubmit={(name, filters, tags) => createMutation.mutate({ name, filters, tags })}
            />
          </div>
        )}

        {selected && !showForm && (
          <div className="space-y-4">
            <div className="bg-white rounded border border-gray-200 p-4">
              <h2 className="font-semibold text-lg">{selected.cohort_definition_name}</h2>
              {selected.cohort_description && <p className="text-sm text-gray-500">{selected.cohort_description}</p>}

              <div className="mt-3 text-sm space-y-1">
                <p><strong>Filters:</strong> <code className="text-xs bg-gray-100 px-1">{JSON.stringify(selected.filters)}</code></p>
                <p><strong>Orthanc Tags:</strong></p>
                {selected.orthanc_tags.length > 0
                  ? <ul className="ml-4 list-disc text-xs">{selected.orthanc_tags.map((t, i) => <li key={i}>{t.tag} ({t.name}) = {t.value}</li>)}</ul>
                  : <p className="text-xs text-gray-400">None</p>}
              </div>

              <button
                onClick={() => resolveMutation.mutate(selected.cohort_definition_id)}
                disabled={resolveMutation.isPending}
                className="mt-3 px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {resolveMutation.isPending ? 'Resolving...' : 'Resolve Cohort'}
              </button>

              {resolveResult && (
                <div className="mt-3 p-3 bg-green-50 rounded text-sm">
                  <strong>{resolveResult.matched_count}</strong> studies matched and labeled in Orthanc.
                </div>
              )}
            </div>

            {members.length > 0 && (
              <div className="bg-white rounded border border-gray-200 p-4">
                <h3 className="font-semibold mb-2 text-sm">Members ({members.length})</h3>
                <ul className="text-xs space-y-1">
                  {members.slice(0, 50).map(m => (
                    <li key={m.subject_id} className="font-mono text-gray-600">{m.subject_id}</li>
                  ))}
                  {members.length > 50 && <li className="text-gray-400">...and {members.length - 50} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingDeleteId && pendingDeleteCohort && (
        <ConfirmDialog
          title="Delete Cohort?"
          message={`Delete "${pendingDeleteCohort.cohort_definition_name}"? This will remove all cohort memberships and Orthanc labels for this cohort.`}
          onConfirm={() => { deleteMutation.mutate(pendingDeleteId); setPendingDeleteId(null) }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}
