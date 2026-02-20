import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCohortDefinitions, createCohortDefinition, resolveCohort, fetchMembers,
  CohortDefinition, OrthancTagCriteria,
} from '../api/mlClient'
import CohortForm from '../components/CohortForm'

export default function CohortPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<CohortDefinition | null>(null)
  const [resolveResult, setResolveResult] = useState<{ matched_count: number; study_uids: string[] } | null>(null)
  const [showForm, setShowForm] = useState(false)

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
              className={`cursor-pointer px-3 py-2 rounded text-sm ${selected?.cohort_definition_id === d.cohort_definition_id ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-100'}`}
            >
              {d.cohort_definition_name}
              <span className="text-xs text-gray-400 block">{new Date(d.created_at).toLocaleDateString()}</span>
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
    </div>
  )
}
