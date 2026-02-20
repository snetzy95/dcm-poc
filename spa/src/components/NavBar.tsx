import { NavLink } from 'react-router-dom'

const links = [
  { to: '/studies', label: 'Studies' },
  { to: '/upload', label: 'Upload' },
  { to: '/cohorts', label: 'Cohorts' },
  { to: '/jobs', label: 'ML Jobs' },
]

export default function NavBar() {
  return (
    <nav className="bg-blue-700 text-white shadow">
      <div className="container mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-bold text-lg tracking-wide">DCM PoC</span>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `text-sm font-medium hover:text-blue-200 transition-colors ${isActive ? 'underline text-white' : 'text-blue-100'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
