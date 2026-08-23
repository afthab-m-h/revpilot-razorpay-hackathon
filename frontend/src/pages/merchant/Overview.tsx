import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import RevenueChart from '../../components/RevenueChart'
import { rupeesNum, type RevenueSummary } from '../../types'

interface FunnelRow {
  product_id: string
  views: number
  add_to_cart: number
  purchases: number
  cart_rate: number
  conversion: number
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-6 animate-fadeUp">
      <p className="label">{label}</p>
      <p className="font-display font-bold tracking-tighter text-4xl mt-3 tabular-nums">{value}</p>
      {sub && <p className="font-mono text-[11px] text-accent mt-2">{sub}</p>}
    </div>
  )
}

export default function Overview() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<RevenueSummary>('/api/analytics/summary').then(setSummary).catch((e) => setError(e.message))
    api.get<FunnelRow[]>('/api/analytics/funnel?limit=8').then(setFunnel).catch(() => {})
  }, [])

  const maxViews = Math.max(...funnel.map((f) => f.views), 1)

  return (
    <div className="space-y-12 animate-fadeIn">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Metric label="Revenue" value={summary ? rupeesNum(summary.revenue_rupees) : '—'} />
        <Metric label="Paid orders" value={summary ? String(summary.orders) : '—'} />
        <Metric label="Avg order value" value={summary ? rupeesNum(summary.aov_rupees) : '—'} />
        <Metric
          label="Conversion"
          value={summary ? `${summary.conversion_rate_percent.toFixed(2)}%` : '—'}
          sub={summary && summary.ai_assisted_orders > 0 ? `${summary.ai_assisted_orders} AI-assisted` : undefined}
        />
      </section>

      <section className="card p-6">
        <div className="flex justify-between items-baseline mb-6">
          <h2 className="font-display font-semibold text-xl tracking-tight">Revenue · last 14 days</h2>
          <span className="label">Simulated payments only</span>
        </div>
        {summary && summary.revenue_by_day_rupees.length > 0 ? (
          <RevenueChart data={summary.revenue_by_day_rupees} />
        ) : (
          <p className="text-sm text-inkMute py-10 text-center">No paid orders yet.</p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-6 border-b border-line pb-4">
          <h2 className="font-display font-semibold text-2xl tracking-tight">Product performance</h2>
          <span className="label">Views → carts → purchases</span>
        </div>
        <div className="card divide-y divide-line">
          {funnel.map((f) => (
            <div key={f.product_id} className="px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              <p className="font-mono text-xs w-24 shrink-0">{f.product_id}</p>
              <div className="flex-1 min-w-[220px] space-y-1.5">
                <div className="h-2 bg-line" style={{ width: '100%' }}>
                  <div className="h-2 bg-accent" style={{ width: `${(f.views / maxViews) * 100}%` }} />
                </div>
                <div className="flex gap-6 font-mono text-[10px] uppercase tracking-widest text-inkMute">
                  <span>{f.views} views</span>
                  <span>{f.add_to_cart} carts ({f.cart_rate}%)</span>
                  <span>{f.purchases} sold ({f.conversion}%)</span>
                </div>
              </div>
            </div>
          ))}
          {funnel.length === 0 && <p className="text-sm text-inkMute p-6">No browsing data yet.</p>}
        </div>
      </section>
    </div>
  )
}
