import { useCallback, useState } from 'react'
import axios from 'axios'

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
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold">Upload DICOM</h1>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <p className="text-gray-500 text-sm">Drag and drop .dcm files here, or click to select</p>
        <input
          id="file-input"
          type="file"
          accept=".dcm"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {uploading && <p className="text-blue-600 text-sm">Uploading...</p>}

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={i} className={`text-sm p-2 rounded ${r.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <strong>{r.file}</strong>: {r.message}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-400">
        Files are uploaded directly to Orthanc. The core service will ingest metadata automatically within a few seconds.
      </p>
    </div>
  )
}
