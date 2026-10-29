import { useEffect, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ensureSeedCategories } from './lib/categories'
import { migrateLegacy } from './lib/migrate'
import { CalendarPage } from './pages/CalendarPage'
import { NotesPage } from './pages/NotesPage'
import { SettingsPage } from './pages/SettingsPage'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
    label: '日历',
    end: true,
    icon: (
      <Icon>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
        <line x1="8" y1="3" x2="8" y2="6.5" />
        <line x1="16" y1="3" x2="16" y2="6.5" />
      </Icon>
    ),
  },
  {
    to: '/notes',
    label: '笔记',
    end: false,
    icon: (
      <Icon>
        <path d="M4 20.5l3.6-.8L20 7.3a2.1 2.1 0 0 0-3-3L4.6 16.7z" />
        <line x1="15.5" y1="5.5" x2="18.5" y2="8.5" />
      </Icon>
    ),
  },
]

export default function App() {
  const { pathname } = useLocation()
  const showTabs = pathname !== '/settings'

  // 首屏立刻渲染；种子分类和旧数据迁移在后台完成，完成后通知页面重新取数
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await ensureSeedCategories()
        await migrateLegacy()
      } finally {
        if (alive) window.dispatchEvent(new Event('ballet-ready'))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="app">
      <main className={showTabs ? 'main' : 'main main-plain'}>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showTabs && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => 'tab' + (isActive ? ' tab-on' : '')}
            >
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
