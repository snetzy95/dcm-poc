import { NavLink } from 'react-router-dom'
import { Database, Upload, Users, Activity, Heart, Settings } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const links = [
  { to: '/studies', label: 'Studies', Icon: Database },
  { to: '/upload', label: 'Upload', Icon: Upload },
  { to: '/cohorts', label: 'Cohorts', Icon: Users },
  { to: '/jobs', label: 'ML Jobs', Icon: Activity },
]

export default function NavBar() {
  const { openPanel } = useTheme()

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-nav transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-16">
        <span className="font-semibold text-lg text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2 shrink-0">
          <Heart className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          DCM Platform
        </span>
        <div className="flex items-center gap-1 flex-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
        {/* Settings gear icon */}
        <button
          onClick={openPanel}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 shrink-0"
          aria-label="Open settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </nav>
  )
}
