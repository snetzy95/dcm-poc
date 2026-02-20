import { Study } from '../api/coreClient'

interface Props {
  studies: Study[]
}

export default function StudyTable({ studies }: Props) {
  if (studies.length === 0) return <p className="text-gray-500 text-sm">No studies found.</p>
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            {['Patient', 'Sex', 'Study Date', 'Description', 'Institution', 'Series', 'Instances', 'Status'].map(h => (
              <th key={h} className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {studies.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs">{s.patient_name ?? s.patient_id ?? '—'}</td>
              <td className="px-3 py-2">{s.patient_sex ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{s.study_date ?? '—'}</td>
              <td className="px-3 py-2">{s.study_description ?? '—'}</td>
              <td className="px-3 py-2">{s.institution_name ?? '—'}</td>
              <td className="px-3 py-2 text-center">{s.num_series}</td>
              <td className="px-3 py-2 text-center">{s.num_instances}</td>
              <td className="px-3 py-2">
                {s.deleted_at
                  ? <span className="inline-block px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">Deleted</span>
                  : <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">Active</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
