import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import RevenueChart from '../../components/RevenueChart'
import { rupees, type Order, type RevenueSummary } from '../../types'

export default function Sales() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<RevenueSummary>('/api/analytics/summary').then(setSummary).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    api.get<Order[]>(`/api/orders?limit=100${status ? `&status=${status}` : ''}`)
      .then(setOrders).catch((e) => setError(e.message))
  }, [status])

  const paid = orders.filter((o) => o.status === 'paid').length

  return (
    <div className="space-y-12 animate-fadeIn">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="card p-6">
        <div className="flex justify-between items-baseline mb-6">
          <h2 className="font-display font-semibold text-xl tracking-tight">Revenue trend · last 14 days</h2>
          <span className="label">{paid} paid in view</span>
        </div>
        {summary && summary.revenue_by_day_rupees.length > 0 ? (
          <RevenueChart data={summary.revenue_by_day_rupees} />
        ) : (
          <p className="text-sm text-inkMute py-10 text-center">No paid orders yet.</p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-line pb-4">
          <h2 className="font-display font-semibold text-2xl tracking-tight">Sales tracking</h2>
          <div className="flex gap-2">
            {[null, 'paid', 'created', 'payment_failed', 'authorized'].map((s) => (
              <button
                key={s ?? 'all'}
                onClick={() => setStatus(s)}
                className={`font-mono text-[10px] uppercase tracking-widest border px-3 py-1.5 transition-all ${
                  status === s ? 'border-accent text-accent' : 'border-line text-inkMute hover:text-ink'
                }`}
              >
                {s?.replace('_', ' ') ?? 'All'}
              </button>
            ))}
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-line text-left">
                {['Order', 'Date', 'Items', 'Customer', 'AI', 'Amount', 'Status'].map((h) => (
                  <th key={h} className="label font-normal px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-paper transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs">{o.id}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-inkMute">
                    {new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-3.5 text-inkMute max-w-[240px] truncate">
                    {(o.items ?? []).map((i) => `${i.product_name ?? i.product_id}×${i.quantity}`).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-inkMute">{o.customer_id ?? 'guest'}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">{o.ai_assisted ? <span className="text-accent">yes</span> : '·'}</td>
                  <td className="px-5 py-3.5 font-mono">{rupees(o.amount)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                      o.status === 'paid'
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : o.status.includes('fail')
                          ? 'border-red-500/40 text-red-500'
                          : 'border-line text-inkMute'
                    }`}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-sm text-inkMute p-6">No orders for this filter.</p>}
        </div>
      </section>
    </div>
  )
}
