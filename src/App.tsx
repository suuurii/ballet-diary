import { useEffect, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ensureSeedCategories } from './lib/categories'
import { TrackPage } from './pages/TrackPage'
import { StatsPage } from './pages/StatsPage'
import { NotesPage } from './pages/NotesPage'
import { MapPage } from './pages/MapPage'
import { SettingsPage } from './pages/SettingsPage'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const TABS = [
  {
    to: '/',
    label: '打卡',
    end: true,
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </Icon>
    ),
  },
  {
    to: '/stats',
    label: '统计',
    end: false,
    icon: (
      <Icon>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </Icon>
    ),
  },
  {
    to: '/notes',
    label: '笔记',
    end: false,
    icon: (
      <Icon>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </Icon>
    ),
  },
  {
    to: '/map',
    label: '地图',
    end: false,
    icon: (
      <Icon>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </Icon>
    ),
  },
  {
    to: '/settings',
    label: '设置',
    end: false,
    icon: (
      <Icon>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </Icon>
    ),
  },
]

export default function App() {
  useEffect(() => {
    ensureSeedCategories()
  }, [])

  return (
    <div className="app">
      <main className="main">
        <Routes>
          <Route path="/" element={<TrackPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => 'tab' + (isActive ? ' tab-active' : '')}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
