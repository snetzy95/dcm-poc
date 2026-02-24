import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchJobs, createJob, startJob, fetchCohortDefinitions,
  deleteJob, submitEdgeResult, aggregateJob,
  MLJob,
} from '../api/mlClient'
import JobStatusBadge from '../components/JobStatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { Trash2, Activity } from 'lucide-react'

const STATUS_BORDER: Record<string, string> = {
  PENDING:     'border-l-slate-400',
  RUNNING:     'border-l-teal-500',
  AGGREGATING: 'border-l-amber-400',
  DONE:        'border-l-emerald-500',
  FAILED:      'border-l-rose-500',
}

export default function JobsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', algorithm: 'fedavg_stub', cohort_definition_id: '', rounds: '3' })
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['jobs'], queryFn: fetchJobs })
  const { data: cohorts = [] } = useQuery({ queryKey: ['cohort-definitions'], queryFn: fetchCohortDefinitions })

  const createMutation = useMutation({
    mutationFn: () => createJob({
      name: form.name,
      algorithm: form.algorithm,
      cohort_definition_id: form.cohort_definition_id || undefined,
      params: { rounds: parseInt(form.rounds) },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setShowForm(false) },
  })

  const startMutation = useMutation({
    mutationFn: (id: string) => startJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const simulateMutation = useMutation({
    mutationFn: (id: string) =>
      Promise.all([
        submitEdgeResult(id, {
          edge_node_id: 'edge-node-1',
          round: 1,
          payload: {
            local_loss: parseFloat((Math.random() * 0.4 + 0.1).toFixed(4)),
            num_samples: Math.floor(Math.random() * 900) + 100,
            model_weights_stub: {},
          },
        }),
        submitEdgeResult(id, {
          edge_node_id: 'edge-node-2',
          round: 1,
          payload: {
            local_loss: parseFloat((Math.random() * 0.4 + 0.1).toFixed(4)),
            num_samples: Math.floor(Math.random() * 900) + 100,
            model_weights_stub: {},
          },
        }),
      ]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const aggregateMutation = useMutation({
    mutationFn: (id: string) => aggregateJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const pendingDeleteJob = pendingDeleteId ? jobs.find(j => j.id === pendingDeleteId) : null

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 hover:border-slate-400 dark:hover:border-slate-500 transition-all duration-200'

  function getCohortLabel(job: MLJob) {
    if (!job.cohort_definition_id) return null
    const cohort = cohorts.find(c => c.cohort_definition_id === job.cohort_definition_id)
    if (cohort) return cohort.cohort_definition_name
    return null  // cohort was deleted
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">ML Jobs</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-all duration-200 shadow-sm hover:shadow"
        >
          {showForm ? 'Cancel' : '+ New Job'}
        </button>
      </div>

      {/* Create Job Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 p-6 max-w-lg space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Create Federated ML Job</h2>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Job Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="FedAvg Round 1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Algorithm</label>
            <input className={inputCls} value={form.algorithm} onChange={e => setForm(f => ({ ...f, algorithm: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Cohort (optional)</label>
            <select className={inputCls} value={form.cohort_definition_id} onChange={e => setForm(f => ({ ...f, cohort_definition_id: e.target.value }))}>
              <option value="">None</option>
              {cohorts.map(c => <option key={c.cohort_definition_id} value={c.cohort_definition_id}>{c.cohort_definition_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Rounds</label>
            <input type="number" min={1} className={inputCls} value={form.rounds} onChange={e => setForm(f => ({ ...f, rounds: e.target.value }))} />
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.name || createMutation.isPending}
            className="px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 active:bg-teal-800 transition-all duration-200 shadow-sm hover:shadow disabled:opacity-50"
          >
            Create Job
          </button>
        </div>
      )}

      {isLoading && <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>}

      {/* Jobs List */}
      <div className="space-y-3">
        {jobs.map(job => {
          const borderCls = STATUS_BORDER[job.status] ?? 'border-l-slate-400'
          return (
            <div key={job.id} className={`bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 border-l-4 ${borderCls} rounded-xl shadow-card overflow-hidden`}>
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors duration-150"
                onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              >
                <JobStatusBadge status={job.status} />
                <span className="font-medium text-slate-800 dark:text-slate-100 text-sm flex-1">{job.name}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{job.algorithm}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(job.created_at).toLocaleDateString()}</span>

                {/* PENDING: Start button */}
                {job.status === 'PENDING' && (
                  <button
                    onClick={e => { e.stopPropagation(); startMutation.mutate(job.id) }}
                    disabled={startMutation.isPending}
                    className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-all duration-200 disabled:opacity-50"
                  >
                    Start
                  </button>
                )}

                {/* RUNNING: Simulate + Aggregate */}
                {job.status === 'RUNNING' && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); simulateMutation.mutate(job.id) }}
                      disabled={simulateMutation.isPending}
                      className="text-xs px-3 py-1.5 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 font-medium transition-all duration-200 disabled:opacity-50"
                      title="Submit 2 fake edge node results"
                    >
                      {simulateMutation.isPending ? '...' : 'Simulate Round'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); aggregateMutation.mutate(job.id) }}
                      disabled={aggregateMutation.isPending}
                      className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-all duration-200 disabled:opacity-50"
                      title="Aggregate edge results and finish job"
                    >
                      {aggregateMutation.isPending ? '...' : 'Aggregate'}
                    </button>
                  </>
                )}

                {/* Trash icon for non-RUNNING jobs */}
                {job.status !== 'RUNNING' && (
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDeleteId(job.id) }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                    title="Delete job"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {expanded === job.id && (
                <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <p>
                    <strong className="text-slate-700 dark:text-slate-200">ID:</strong>{' '}
                    <code className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{job.id}</code>
                  </p>
                  <p>
                    <strong className="text-slate-700 dark:text-slate-200">Cohort:</strong>{' '}
                    {job.cohort_definition_id
                      ? getCohortLabel(job) !== null
                        ? getCohortLabel(job)
                        : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Cohort deleted</span>
                      : '—'
                    }
                  </p>
                  <p>
                    <strong className="text-slate-700 dark:text-slate-200">Params:</strong>{' '}
                    <code className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{JSON.stringify(job.params)}</code>
                  </p>
                  {job.started_at && <p><strong className="text-slate-700 dark:text-slate-200">Started:</strong> {new Date(job.started_at).toLocaleString()}</p>}
                  {job.finished_at && <p><strong className="text-slate-700 dark:text-slate-200">Finished:</strong> {new Date(job.finished_at).toLocaleString()}</p>}
                  {job.result_summary && (
                    <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Result Summary</p>
                      <pre className="whitespace-pre-wrap text-slate-600 dark:text-slate-300 font-mono">{JSON.stringify(job.result_summary, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {jobs.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <Activity className="h-12 w-12 mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No jobs yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Create your first federated ML job</p>
          </div>
        )}
      </div>

      {pendingDeleteId && pendingDeleteJob && (
        <ConfirmDialog
          title="Delete Job?"
          message={`Delete job "${pendingDeleteJob.name}" (${pendingDeleteJob.status})? All edge results will also be deleted.`}
          onConfirm={() => { deleteMutation.mutate(pendingDeleteId); setPendingDeleteId(null) }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}
