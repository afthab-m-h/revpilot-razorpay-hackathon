import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { useCustomer } from '../lib/customer'
import { rupees } from '../types'

const CUSTOMER_LINKS = [
  { to: '/store', label: 'Store' },
  { to: '/store/categories', label: 'Categories' },
  { to: '/store/cart', label: 'Cart' },
  { to: '/store/orders', label: 'Orders' },
]

const MERCHANT_LINKS = [
  { to: '/merchant', label: 'Overview' },
  { to: '/merchant/products', label: 'Products' },
  { to: '/merchant/sales', label: 'Sales' },
  { to: '/merchant/opportunities', label: 'AI Opportunities' },
  { to: '/merchant/reports', label: 'Reports' },
  { to: '/merchant/audit', label: 'Audit' },
]

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
  const nav = useNavigate()
  const { cart, total } = useCustomer()

  const role = loc.pathname.startsWith('/merchant') ? 'merchant' : loc.pathname.startsWith('/store') ? 'customer' : null
  const links = role === 'merchant' ? MERCHANT_LINKS : role === 'customer' ? CUSTOMER_LINKS : []

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0)

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <span className="w-2.5 h-2.5 bg-accent transition-transform duration-300 group-hover:rotate-45" />
          <span className="font-display font-bold tracking-tight text-lg">
            REV<span className="text-accent">PILOT</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`font-mono text-[11px] uppercase tracking-[0.18em] whitespace-nowrap pb-1 border-b transition-colors duration-200 ${
                (loc.pathname === l.to || (l.to !== '/merchant' && l.to !== '/store' && loc.pathname.startsWith(l.to)))
                  ? 'border-accent text-ink'
                  : 'border-transparent text-inkMute hover:text-ink'
              }`}
            >
              {l.label}
              {l.label === 'Cart' && cartCount > 0 ? ` · ${cartCount}` : ''}
              {l.label === 'Cart' && cartCount > 0 ? ` (${rupees(total)})` : ''}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {role && (
            <span className="label hidden lg:block">{role === 'merchant' ? 'Merchant console' : 'StrideX store'}</span>
          )}
          {!role && (
            <button onClick={() => nav(role === null ? '/store' : role)} className="hidden" />
          )}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-9 h-9 flex items-center justify-center border border-line text-ink hover:border-accent hover:text-accent transition-all duration-200"
          >
            <span className="block dark:hidden"><SunIcon /></span>
            <span className="hidden dark:block"><MoonIcon /></span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {role && (
        <nav className="md:hidden flex gap-5 px-6 pb-3 overflow-x-auto">
          {links.map((l) => (
            <Link key={l.to} to={l.to}
              className={`font-mono text-[10px] uppercase tracking-[0.16em] whitespace-nowrap ${
                loc.pathname === l.to ? 'text-accent' : 'text-inkMute'}`}>
              {l.label}{l.label === 'Cart' && cartCount > 0 ? ` · ${cartCount}` : ''}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
