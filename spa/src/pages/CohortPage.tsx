import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCohortDefinitions, createCohortDefinition, resolveCohort, fetchMembers,
  deleteCohortDefinition,
  CohortDefinition, OrthancTagCriteria,
} from '../api/mlClient'
import CohortForm from '../components/CohortForm'
import ConfirmDialog from '../components/ConfirmDialog'
import { Trash2, Users } from 'lucide-react'

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
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">Cohorts</h1>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar: list */}
        <div className="w-80 shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Cohort Definitions</h2>
              <button
                onClick={() => setShowForm(s => !s)}
                className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-all duration-200 shadow-sm"
              >
                {showForm ? 'Cancel' : '+ New'}
              </button>
            </div>

            {isLoading && <p className="text-slate-400 dark:text-slate-500 text-sm px-4 py-3">Loading...</p>}

            {definitions.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500">
                <Users className="h-8 w-8 mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No cohorts yet</p>
              </div>
            )}

            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {definitions.map(d => (
                <li
                  key={d.cohort_definition_id}
                  onClick={() => { setSelected(d); setResolveResult(null) }}
                  className={`cursor-pointer px-4 py-3 text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                    selected?.cohort_definition_id === d.cohort_definition_id
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-l-2 border-l-teal-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-slate-700 dark:text-slate-200">{d.cohort_definition_name}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDeleteId(d.cohort_definition_id) }}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                    title="Delete cohort"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: form or detail */}
        <div className="flex-1 space-y-6">
          {showForm && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">New Cohort Definition</h2>
              <CohortForm
                loading={createMutation.isPending}
                onSubmit={(name, filters, tags) => createMutation.mutate({ name, filters, tags })}
              />
            </div>
          )}

          {selected && !showForm && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{selected.cohort_definition_name}</h2>
                {selected.cohort_description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{selected.cohort_description}</p>}

                <div className="mt-4 text-sm space-y-2">
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Filters</span>
                    <code className="mt-1 block text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700">{JSON.stringify(selected.filters)}</code>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Orthanc Tags</span>
                    {selected.orthanc_tags.length > 0
                      ? <ul className="mt-1 ml-4 list-disc text-xs text-slate-600 dark:text-slate-300">{selected.orthanc_tags.map((t, i) => <li key={i}>{t.tag} ({t.name}) = {t.value}</li>)}</ul>
                      : <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">None</p>}
                  </div>
                </div>

                <button
                  onClick={() => resolveMutation.mutate(selected.cohort_definition_id)}
                  disabled={resolveMutation.isPending}
                  className="mt-4 px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-all duration-200 shadow-sm hover:shadow disabled:opacity-50"
                >
                  {resolveMutation.isPending ? 'Resolving...' : 'Resolve Cohort'}
                </button>

                {resolveResult && (
                  <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300">
                    <strong>{resolveResult.matched_count}</strong> studies matched and labeled in Orthanc.
                  </div>
                )}
              </div>

              {members.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 p-6">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-3 text-sm">Members ({members.length})</h3>
                  <ul className="text-xs space-y-1">
                    {members.slice(0, 50).map(m => (
                      <li key={m.subject_id} className="font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded">{m.subject_id}</li>
                    ))}
                    {members.length > 50 && <li className="text-slate-400 dark:text-slate-500 italic">...and {members.length - 50} more</li>}
                  </ul>
                </div>
              )}
            </>
          )}

          {!selected && !showForm && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
              <Users className="h-12 w-12 mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Select a cohort to view details</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">or create a new one</p>
            </div>
          )}
        </div>
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
