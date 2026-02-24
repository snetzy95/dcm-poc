import { useCallback, useState } from 'react'
import axios from 'axios'
import { Upload } from 'lucide-react'

interface UploadResult {
  file: string
  status: 'success' | 'error'
  message: string
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [uploading, setUploading] = useState(false)

  const uploadFile = async (file: File) => {
    const buffer = await file.arrayBuffer()
    try {
      const resp = await axios.post('/orthanc/instances', buffer, {
        headers: { 'Content-Type': 'application/dicom' },
      })
      setResults(r => [...r, { file: file.name, status: 'success', message: `Instance ID: ${resp.data.ID}` }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setResults(r => [...r, { file: file.name, status: 'error', message: msg }])
    }
  }

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
    setUploading(false)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">Upload DICOM</h1>
      </div>

      <div className="max-w-2xl">
        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
            dragging
              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 scale-[1.02] ring-4 ring-teal-500/20'
              : 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-900/20'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="flex flex-col items-center">
            <Upload className="h-12 w-12 text-slate-400 dark:text-slate-500 mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium mb-1">Drag DICOM files here</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">or click to browse</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">.dcm files</p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".dcm"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>

        {uploading && (
          <div className="mt-4 flex items-center gap-2 text-teal-600 dark:text-teal-400 text-sm font-medium">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Uploading...
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl shadow-card border border-slate-100 dark:border-slate-700 overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {results.map((r, i) => (
                <li key={i} className={`px-4 py-3 text-sm flex items-start gap-2 ${r.status === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${r.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <strong>{r.file}</strong>: {r.message}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          Files are uploaded directly to Orthanc. The core service will ingest metadata automatically within a few seconds.
        </p>
      </div>
    </div>
  )
}
