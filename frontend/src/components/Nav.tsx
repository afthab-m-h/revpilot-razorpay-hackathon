import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../lib/theme'

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export default function Nav() {
  const { theme, toggle } = useTheme()
  const loc = useLocation()
  const link = (to: string, label: string) => (
    <Link
      to={to}
      className={`font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-200 pb-1 border-b ${
        loc.pathname === to ? 'border-accent text-ink' : 'border-transparent text-inkMute hover:text-ink'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="w-2.5 h-2.5 bg-accent transition-transform duration-300 group-hover:rotate-45" />
          <span className="font-display font-700 font-bold tracking-tight text-lg">
            REV<span className="text-accent">PILOT</span>
          </span>
        </Link>

        <nav className="flex items-center gap-8">
          {link('/', 'Store')}
          {link('/dashboard', 'Dashboard')}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-9 h-9 flex items-center justify-center border border-line text-ink hover:border-accent hover:text-accent transition-all duration-200"
          >
            <span className="block dark:hidden"><SunIcon /></span>
            <span className="hidden dark:block"><MoonIcon /></span>
          </button>
        </nav>
      </div>
    </header>
  )
}
