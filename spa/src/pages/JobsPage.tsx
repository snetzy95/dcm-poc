import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchJobs, createJob, startJob, fetchCohortDefinitions,
  deleteJob, submitEdgeResult, aggregateJob,
  MLJob,
} from '../api/mlClient'
import JobStatusBadge from '../components/JobStatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  )
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

  const inputCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  function getCohortLabel(job: MLJob) {
    if (!job.cohort_definition_id) return null
    const cohort = cohorts.find(c => c.cohort_definition_id === job.cohort_definition_id)
    if (cohort) return cohort.cohort_definition_name
    return null  // cohort was deleted
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ML Jobs</h1>
        <button onClick={() => setShowForm(s => !s)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ New Job'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded p-4 space-y-3 max-w-lg">
          <h2 className="font-semibold text-sm">Create Federated ML Job</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Job Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="FedAvg Round 1" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Algorithm</label>
            <input className={inputCls} value={form.algorithm} onChange={e => setForm(f => ({ ...f, algorithm: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cohort (optional)</label>
            <select className={inputCls} value={form.cohort_definition_id} onChange={e => setForm(f => ({ ...f, cohort_definition_id: e.target.value }))}>
              <option value="">None</option>
              {cohorts.map(c => <option key={c.cohort_definition_id} value={c.cohort_definition_id}>{c.cohort_definition_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rounds</label>
            <input type="number" min={1} className={inputCls} value={form.rounds} onChange={e => setForm(f => ({ ...f, rounds: e.target.value }))} />
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            Create Job
          </button>
        </div>
      )}

      {isLoading && <p className="text-gray-400 text-sm">Loading...</p>}

      <div className="space-y-2">
        {jobs.map(job => (
          <div key={job.id} className="bg-white border border-gray-200 rounded">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
            >
              <JobStatusBadge status={job.status} />
              <span className="font-medium text-sm flex-1">{job.name}</span>
              <span className="text-xs text-gray-400">{job.algorithm}</span>
              <span className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString()}</span>

              {/* PENDING: Start button */}
              {job.status === 'PENDING' && (
                <button
                  onClick={e => { e.stopPropagation(); startMutation.mutate(job.id) }}
                  disabled={startMutation.isPending}
                  className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
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
                    className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                    title="Submit 2 fake edge node results"
                  >
                    {simulateMutation.isPending ? '...' : 'Simulate Round'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); aggregateMutation.mutate(job.id) }}
                    disabled={aggregateMutation.isPending}
                    className="text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
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
                  className="text-gray-400 hover:text-red-500 p-1 rounded"
                  title="Delete job"
                >
                  <TrashIcon />
                </button>
              )}
            </div>

            {expanded === job.id && (
              <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600 space-y-1">
                <p><strong>ID:</strong> <code>{job.id}</code></p>
                <p>
                  <strong>Cohort:</strong>{' '}
                  {job.cohort_definition_id
                    ? getCohortLabel(job) !== null
                      ? getCohortLabel(job)
                      : <span className="inline-block px-2 py-0.5 text-xs rounded bg-orange-100 text-orange-700">Cohort deleted</span>
                    : '—'
                  }
                </p>
                <p><strong>Params:</strong> <code>{JSON.stringify(job.params)}</code></p>
                {job.started_at && <p><strong>Started:</strong> {new Date(job.started_at).toLocaleString()}</p>}
                {job.finished_at && <p><strong>Finished:</strong> {new Date(job.finished_at).toLocaleString()}</p>}
                {job.result_summary && (
                  <div className="mt-2 p-2 bg-gray-50 rounded">
                    <p className="font-medium mb-1">Result Summary</p>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(job.result_summary, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && !isLoading && <p className="text-gray-400 text-sm">No jobs yet.</p>}
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
