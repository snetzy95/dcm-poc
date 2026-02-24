import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import SettingsPanel from './components/SettingsPanel'
import { useTheme } from './context/ThemeContext'
import StudiesPage from './pages/StudiesPage'
import UploadPage from './pages/UploadPage'
import CohortPage from './pages/CohortPage'
import JobsPage from './pages/JobsPage'

export default function App() {
  const { isPanelOpen, closePanel } = useTheme()

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/studies" replace />} />
          <Route path="/studies" element={<StudiesPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/cohorts" element={<CohortPage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </main>
      {isPanelOpen && <SettingsPanel onClose={closePanel} />}
    </div>
  )
}
