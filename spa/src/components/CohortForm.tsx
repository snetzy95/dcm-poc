import { useState } from 'react'
import { OrthancTagCriteria } from '../api/mlClient'

interface Filters {
  modalities: string
  study_date_from: string
  study_date_to: string
  patient_sex: string
  patient_age_min: string
  patient_age_max: string
  body_part_examined: string
  institution_name: string
}

interface Props {
  onSubmit: (name: string, filters: Record<string, unknown>, tags: OrthancTagCriteria[]) => void
  loading: boolean
}

export default function CohortForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState('')
  const [filters, setFilters] = useState<Filters>({
    modalities: '', study_date_from: '', study_date_to: '',
    patient_sex: '', patient_age_min: '', patient_age_max: '',
    body_part_examined: '', institution_name: '',
  })
  const [tagInput, setTagInput] = useState({ tag: '', name: '', value: '' })
  const [tags, setTags] = useState<OrthancTagCriteria[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanFilters: Record<string, unknown> = {}
    if (filters.modalities) cleanFilters.modalities = filters.modalities.split(',').map(m => m.trim().toUpperCase())
    if (filters.study_date_from) cleanFilters.study_date_from = filters.study_date_from
    if (filters.study_date_to) cleanFilters.study_date_to = filters.study_date_to
    if (filters.patient_sex) cleanFilters.patient_sex = filters.patient_sex
    if (filters.patient_age_min) cleanFilters.patient_age_min = parseInt(filters.patient_age_min)
    if (filters.patient_age_max) cleanFilters.patient_age_max = parseInt(filters.patient_age_max)
    if (filters.body_part_examined) cleanFilters.body_part_examined = filters.body_part_examined
    if (filters.institution_name) cleanFilters.institution_name = filters.institution_name
    onSubmit(name, cleanFilters, tags)
  }

  const addTag = () => {
    if (tagInput.tag && tagInput.name && tagInput.value) {
      setTags([...tags, { ...tagInput }])
      setTagInput({ tag: '', name: '', value: '' })
    }
  }

  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 hover:border-slate-400 transition-all duration-200'
  const labelCls = 'block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Cohort Name *</label>
        <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CT Chest Female 2022-2024" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Modalities (comma-separated)</label>
          <input className={inputCls} value={filters.modalities} onChange={e => setFilters(f => ({ ...f, modalities: e.target.value }))} placeholder="CT,MR" />
        </div>
        <div>
          <label className={labelCls}>Patient Sex</label>
          <select className={inputCls} value={filters.patient_sex} onChange={e => setFilters(f => ({ ...f, patient_sex: e.target.value }))}>
            <option value="">Any</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Study Date From</label>
          <input type="date" className={inputCls} value={filters.study_date_from} onChange={e => setFilters(f => ({ ...f, study_date_from: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Study Date To</label>
          <input type="date" className={inputCls} value={filters.study_date_to} onChange={e => setFilters(f => ({ ...f, study_date_to: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Min Age</label>
          <input type="number" min={0} className={inputCls} value={filters.patient_age_min} onChange={e => setFilters(f => ({ ...f, patient_age_min: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Max Age</label>
          <input type="number" min={0} className={inputCls} value={filters.patient_age_max} onChange={e => setFilters(f => ({ ...f, patient_age_max: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Body Part Examined</label>
          <input className={inputCls} value={filters.body_part_examined} onChange={e => setFilters(f => ({ ...f, body_part_examined: e.target.value }))} placeholder="CHEST" />
        </div>
        <div>
          <label className={labelCls}>Institution Name</label>
          <input className={inputCls} value={filters.institution_name} onChange={e => setFilters(f => ({ ...f, institution_name: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className={labelCls}>Orthanc Tag Criteria</p>
        <div className="flex gap-2 mb-2">
          <input className={`${inputCls} flex-1`} placeholder="Tag (0008,0060)" value={tagInput.tag} onChange={e => setTagInput(t => ({ ...t, tag: e.target.value }))} />
          <input className={`${inputCls} flex-1`} placeholder="Name (Modality)" value={tagInput.name} onChange={e => setTagInput(t => ({ ...t, name: e.target.value }))} />
          <input className={`${inputCls} flex-1`} placeholder="Value (CT)" value={tagInput.value} onChange={e => setTagInput(t => ({ ...t, value: e.target.value }))} />
          <button type="button" onClick={addTag} className="px-3 py-2.5 text-sm font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 whitespace-nowrap">Add</button>
        </div>
        {tags.length > 0 && (
          <ul className="text-xs space-y-1">
            {tags.map((t, i) => (
              <li key={i} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{t.tag}</code>
                <span className="text-slate-500">{t.name}</span>
                <span className="text-slate-400">=</span>
                <strong className="text-slate-700">{t.value}</strong>
                <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="ml-auto text-slate-400 hover:text-rose-500 transition-colors duration-200">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={loading} className="px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 active:bg-teal-800 transition-all duration-200 shadow-sm hover:shadow disabled:opacity-50">
        {loading ? 'Saving...' : 'Save Cohort Definition'}
      </button>
    </form>
  )
}
