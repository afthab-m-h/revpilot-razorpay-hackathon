import { Link } from 'react-router-dom'
import { useCustomer } from '../lib/customer'

function ArrowIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export default function Landing() {
  const { cart } = useCustomer()

  const roles = [
    {
      to: '/store',
      kicker: 'Role 01 · Shopper',
      title: 'CUSTOMER',
      desc: 'Browse the StrideX catalog, work with an AI shopping agent that reads real co-purchase data, and check out through a policy-gated simulated payment gateway.',
      points: ['AI shopping assistant', 'Cross-sell recommendations', 'Simulated checkout & payments', 'Order history'],
    },
    {
      to: '/merchant',
      kicker: 'Role 02 · Merchant',
      title: 'MERCHANT',
      desc: 'Run the store: revenue analytics, product and stock management, AI-detected revenue opportunities with human approval, and a complete audit trail.',
      points: ['Revenue dashboard & reports', 'Product & stock management', 'AI opportunities → approval gate', 'Full audit log'],
    },
  ]

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10">
      {/* Hero */}
      <section className="pt-20 md:pt-32 pb-16 animate-fadeUp">
        <p className="label mb-8">Agentic Commerce Platform</p>
        <h1 className="font-display font-bold tracking-tighter leading-[0.9] text-[15vw] md:text-[9rem]">
          REV<span className="text-accent">PILOT</span>
        </h1>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-8 border-b border-line pb-14">
          <p className="max-w-xl text-lg text-inkMute leading-relaxed">
            AI agents that grow merchant revenue — recommending, bundling and selling,
            while every money action stays <span className="text-ink">bounded</span>,{' '}
            <span className="text-ink">gated</span> and <span className="text-ink">auditable</span>.
          </p>
          <p className="label shrink-0">Razorpay-style sandbox · Test mode only</p>
        </div>
      </section>

      {/* Role cards - identical dimensions, top-aligned */}
      <section className="grid md:grid-cols-2 gap-6 pb-28 items-stretch">
        {roles.map((r, i) => (
          <Link
            key={r.to}
            to={r.to}
            className={`card group p-8 md:p-12 flex flex-col h-full min-h-[420px] transition-all duration-300 hover:border-accent animate-fadeUp`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="flex items-start justify-between">
              <p className="label">{r.kicker}</p>
              <span className="text-inkMute group-hover:text-accent group-hover:translate-x-1.5 transition-all duration-300">
                <ArrowIcon />
              </span>
            </div>
            <h2 className="font-display font-bold tracking-tighter text-6xl md:text-7xl mt-auto pt-16">
              {r.title}
            </h2>
            <p className="text-sm text-inkMute leading-relaxed mt-5 max-w-md">{r.desc}</p>
            <ul className="mt-6 space-y-1.5 border-t border-line pt-5">
              {r.points.map((p) => (
                <li key={p} className="font-mono text-[11px] uppercase tracking-[0.14em] text-inkMute flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent" /> {p}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </section>

      {cart.length > 0 && (
        <Link to="/store/cart" className="block mb-20 card p-4 px-6 hover:border-accent transition-colors text-sm">
          You have {cart.reduce((s, l) => s + l.quantity, 0)} item(s) waiting in your cart —{' '}
          <span className="text-accent">return to checkout →</span>
        </Link>
      )}
    </main>
  )
}
