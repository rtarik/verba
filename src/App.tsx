import { NavLink, Route, Routes } from 'react-router-dom'
import Library from './routes/Library'
import Reader from './routes/Reader'
import Grammar from './routes/Grammar'
import Stats from './routes/Stats'

const tabs = [
  { to: '/', label: 'Read', end: true },
  { to: '/grammar', label: 'Grammar', end: false },
  { to: '/stats', label: 'Progress', end: false },
]

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--paper) 88%, transparent)', borderBottom: '1px solid var(--edge)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-5 py-3">
          <NavLink to="/" className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-reading)' }}>
            Verba
          </NavLink>
          <nav className="flex gap-4 text-sm">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--ink-soft)' })}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/read/:id" element={<Reader />} />
          <Route path="/grammar" element={<Grammar />} />
          <Route path="/grammar/:id" element={<Grammar />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
    </div>
  )
}
