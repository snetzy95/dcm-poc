import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJobs, createJob, startJob, fetchCohortDefinitions, MLJob } from '../api/mlClient'
import JobStatusBadge from '../components/JobStatusBadge'

export default function JobsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', algorithm: 'fedavg_stub', cohort_definition_id: '', rounds: '3' })

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

  const inputCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

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
              {job.status === 'PENDING' && (
                <button
                  onClick={e => { e.stopPropagation(); startMutation.mutate(job.id) }}
                  className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Start
                </button>
              )}
            </div>

            {expanded === job.id && (
              <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600 space-y-1">
                <p><strong>ID:</strong> <code>{job.id}</code></p>
                <p><strong>Cohort:</strong> {job.cohort_definition_id ?? '—'}</p>
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
    </div>
  )
}
