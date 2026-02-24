import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sun, Moon, ExternalLink, Server, Activity } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

// Devicons CDN — reliable colored SVG logos
const PROMETHEUS_LOGO = 'https://raw.githubusercontent.com/devicons/devicon/master/icons/prometheus/prometheus-original.svg'
const GRAFANA_LOGO    = 'https://raw.githubusercontent.com/devicons/devicon/master/icons/grafana/grafana-original.svg'
const POSTGRES_LOGO   = 'https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original.svg'
const ORTHANC_LOGO    = 'https://www.orthanc-server.com/img/Carousel/1-Logo.png'
const EGROUP_LOGO     = 'https://www.egroup.hu/wp-content/uploads/2021/03/E-Group-feh%C3%A9r-transzparens-bkg.png'

// DBeaver deep-link: opens a connection directly to our PostgreSQL DB
const DBEAVER_URL =
  'dbeaver://open?driver=postgresql&host=localhost&port=5432&database=dcmdb&user=dcm&password=dcm'

type IconService = {
  type: 'icon'
  name: string
  url: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
}

type ImgService = {
  type: 'img'
  name: string
  url: string
  logo: string
  /** when true, render logo inside a teal pill (for white logos) */
  tealBg?: boolean
}

type ServiceEntry = IconService | ImgService

const SERVICES: ServiceEntry[] = [
  { type: 'icon', name: 'Core API',   url: 'http://localhost:8001/docs', Icon: Server,   color: 'text-teal-500'   },
  { type: 'icon', name: 'ML API',     url: 'http://localhost:8002/docs', Icon: Activity, color: 'text-violet-500' },
  { type: 'img',  name: 'Orthanc',    url: 'http://localhost:8042',       logo: ORTHANC_LOGO    },
  { type: 'img',  name: 'Prometheus', url: 'http://localhost:9090',       logo: PROMETHEUS_LOGO },
  { type: 'img',  name: 'Grafana',    url: 'http://localhost:3001',       logo: GRAFANA_LOGO    },
  { type: 'img',  name: 'PostgreSQL', url: DBEAVER_URL,                   logo: POSTGRES_LOGO   },
]

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { theme, toggleTheme } = useTheme()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-600/30 dark:bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Slide-in Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-96 max-w-full
          bg-white dark:bg-slate-900
          border-l border-slate-200 dark:border-slate-700
          shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Settings</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

          {/* About */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">About</h3>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">DCM Platform</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                DICOM Federated ML Platform — proof of concept for privacy-preserving medical imaging AI.
              </p>
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Developed by</p>
                <a
                  href="https://www.egroup.hu/hu/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2.5 group"
                >
                  {/* White E-Group logo on teal pill background */}
                  <span className="inline-flex items-center justify-center rounded-lg bg-teal-600 group-hover:bg-teal-700 transition-colors duration-200 px-3 py-1.5">
                    <img
                      src={EGROUP_LOGO}
                      alt="E-Group"
                      className="h-4 w-auto object-contain"
                    />
                  </span>
                  <span className="text-sm font-semibold text-teal-600 dark:text-teal-400 group-hover:underline">
                    E-Group
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:text-teal-400 transition-colors duration-200" />
                </a>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                  Hungarian IT solutions provider specializing in enterprise infrastructure,
                  cloud services, cybersecurity, and digital transformation.
                </p>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                {theme === 'dark'
                  ? <Moon className="h-5 w-5 text-slate-300" />
                  : <Sun className="h-5 w-5 text-amber-500" />
                }
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {theme === 'dark' ? 'Dark' : 'Light'} mode
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Saved to browser</p>
                </div>
              </div>
              {/* Toggle switch */}
              <button
                onClick={toggleTheme}
                role="switch"
                aria-checked={theme === 'dark'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-400/50 dark:focus:ring-teal-300/60 ${
                  theme === 'dark' ? 'bg-teal-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Services */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Services</h3>
            <div className="grid grid-cols-2 gap-3">
              {SERVICES.map((svc) => (
                <a
                  key={svc.name}
                  href={svc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col items-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-all duration-200 cursor-pointer no-underline"
                >
                  {svc.type === 'icon' ? (
                    <svc.Icon className={`h-8 w-8 ${svc.color}`} />
                  ) : (
                    <img
                      src={svc.logo}
                      alt={`${svc.name} logo`}
                      className="h-8 w-8 object-contain"
                    />
                  )}
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors duration-200">
                    {svc.name}
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-teal-400 transition-colors duration-200" />
                </a>
              ))}
            </div>
          </section>

        </div>
      </div>
    </>,
    document.body
  )
}
