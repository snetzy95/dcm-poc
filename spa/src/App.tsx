import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import StudiesPage from './pages/StudiesPage'
import UploadPage from './pages/UploadPage'
import CohortPage from './pages/CohortPage'
import JobsPage from './pages/JobsPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/studies" replace />} />
          <Route path="/studies" element={<StudiesPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/cohorts" element={<CohortPage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </main>
    </div>
  )
}
