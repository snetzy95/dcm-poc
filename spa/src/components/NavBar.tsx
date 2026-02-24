import { NavLink } from 'react-router-dom'
import { Database, Upload, Users, Activity, Heart } from 'lucide-react'

const links = [
  { to: '/studies', label: 'Studies', Icon: Database },
  { to: '/upload', label: 'Upload', Icon: Upload },
  { to: '/cohorts', label: 'Cohorts', Icon: Users },
  { to: '/jobs', label: 'ML Jobs', Icon: Activity },
]

export default function NavBar() {
  return (
    <nav className="bg-white border-b border-slate-200 shadow-nav">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-16">
        <span className="font-semibold text-lg text-slate-800 tracking-tight flex items-center gap-2">
          <Heart className="h-5 w-5 text-teal-600" />
          DCM Platform
        </span>
        <div className="flex items-center gap-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'text-teal-600 bg-teal-50'
                    : 'text-slate-600 hover:text-teal-600 hover:bg-slate-50'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
