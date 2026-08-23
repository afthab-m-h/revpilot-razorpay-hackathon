import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import RevenueChart from '../components/RevenueChart'
import { rupees, rupeesNum, type AuditEntry, type Offer, type Opportunity, type Order, type RevenueSummary } from '../types'

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-6 animate-fadeUp">
      <p className="label">{label}</p>
      <p className="font-display font-bold tracking-tighter text-4xl mt-3 tabular-nums">{value}</p>
      {sub && <p className="font-mono text-[11px] text-accent mt-2">{sub}</p>}
    </div>
  )
}

function ReviewModal({
  opp,
  onClose,
}: {
  opp: Opportunity
  onClose: (changed: boolean) => void
}) {
  const [result, setResult] = useState<{ offerId?: string; status?: string; summary?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const discount = opp.proposed_action?.discount_percent ?? 6

  async function propose(percent: number) {
    setBusy(true)
    try {
      const res = await api.post<{ offer_id?: string; status?: string; policy_summary?: string; error?: string }>(
        `/api/agent/opportunities/${opp.id}/propose?discount_percent=${percent}`,
      )
      setResult({ offerId: res.offer_id, status: res.status, summary: res.policy_summary ?? res.error })
    } catch (e) {
      setResult({ status: 'error', summary: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    if (!result?.offerId) return
    setBusy(true)
    try {
      await api.post(`/api/offers/${result.offerId}/approve`)
      onClose(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(false)} />
      <div className="relative card w-full max-w-lg animate-fadeUp shadow-2xl">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center">
          <p className="label">AI Recommendation · Review</p>
          <button onClick={() => onClose(!!result)} className="font-mono text-xs text-inkMute hover:text-ink">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <h3 className="font-display font-bold text-xl tracking-tight leading-snug">{opp.title}</h3>
          <p className="text-sm text-inkMute leading-relaxed">{opp.reason}</p>

          <div className="grid grid-cols-3 gap-px bg-line border border-line">
            <div className="bg-surface p-3">
              <p className="label">Confidence</p>
              <p className="font-display text-xl font-semibold mt-1">{(opp.confidence * 100).toFixed(0)}%</p>
            </div>
            {opp.expected_impact?.aov_uplift_rupees != null && (
              <div className="bg-surface p-3">
                <p className="label">AOV uplift</p>
                <p className="font-display text-xl font-semibold mt-1">
                  {rupeesNum(opp.expected_impact.aov_uplift_rupees)}
                </p>
              </div>
            )}
            {opp.proposed_action?.bundle_price_rupees != null && (
              <div className="bg-surface p-3">
                <p className="label">Bundle price</p>
                <p className="font-display text-xl font-semibold mt-1">
                  {rupeesNum(opp.proposed_action.bundle_price_rupees)}
                </p>
              </div>
            )}
          </div>

          {result ? (
            <div
              className={`border-l-2 p-4 ${
                result.status === 'proposed'
                  ? 'border-emerald-500 bg-emerald-500/5'
                  : result.status === 'blocked'
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-line'
              }`}
            >
              <p className="label">Policy engine</p>
              <p className="text-sm mt-1.5 font-medium">{result.summary}</p>
              {result.status === 'proposed' && (
                <button onClick={approve} disabled={busy} className="btn-primary mt-4 w-full">
                  Approve &amp; execute offer
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="label">Propose a bundle discount</p>
              <button onClick={() => propose(discount)} disabled={busy} className="btn-primary w-full">
                Propose {discount}% bundle offer
              </button>
              <button onClick={() => propose(30)} disabled={busy} className="btn-ghost w-full">
                Try 30% — policy will block this
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [reviewing, setReviewing] = useState<Opportunity | null>(null)
  const [tab, setTab] = useState<'overview' | 'audit'>('overview')
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(() => {
    api.get<RevenueSummary>('/api/analytics/summary').then(setSummary).catch((e) => setError(e.message))
    api.get<Opportunity[]>('/api/analytics/opportunities?refresh=true').then(setOpps).catch(() => {})
    api.get<Order[]>('/api/orders?limit=8').then(setOrders).catch(() => {})
    api.get<AuditEntry[]>('/api/audit?limit=25').then(setAudit).catch(() => {})
    api.get<Offer[]>('/api/offers').then(setOffers).catch(() => {})
  }, [])

  useEffect(loadAll, [loadAll])

  async function dismiss(id: string) {
    await api.post(`/api/opportunities/${id}/dismiss`)
    setOpps((o) => o.filter((x) => x.id !== id))
  }

  async function rejectOffer(id: string) {
    await api.post(`/api/offers/${id}/reject`)
    api.get<Offer[]>('/api/offers').then(setOffers).catch(() => {})
  }

  const openOpps = opps.filter((o) => o.status === 'open')
  const proposedOffers = offers.filter((o) => o.status === 'proposed')

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10 pb-24">
      {/* Header */}
      <section className="pt-14 md:pt-20 pb-10 animate-fadeUp">
        <p className="label mb-5">Merchant Console · StrideX</p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display font-bold tracking-tighter leading-[0.95] text-5xl md:text-7xl">
            Your agents found{' '}
            <span className="text-accent">{openOpps.length || 'no'} opportunities</span>.
          </h1>
          <button onClick={loadAll} className="btn-ghost shrink-0">Refresh data</button>
        </div>
      </section>

      {error && <p className="text-sm text-red-500 mb-6">{error}</p>}

      {/* Metrics */}
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

      {/* Tabs */}
      <nav className="flex gap-8 mt-14 mb-8 border-b border-line">
        {(['overview', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-mono text-[11px] uppercase tracking-[0.18em] pb-3 -mb-px border-b-2 transition-colors ${
              tab === t ? 'border-accent text-ink' : 'border-transparent text-inkMute hover:text-ink'
            }`}
          >
            {t === 'overview' ? 'Overview & Opportunities' : 'Orders & Audit'}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="space-y-12 animate-fadeIn">
          {/* Chart */}
          <section className="card p-6">
            <div className="flex justify-between items-baseline mb-6">
              <h2 className="font-display font-semibold text-xl tracking-tight">Revenue · last 14 days</h2>
              <span className="label">Test / mock payments only</span>
            </div>
            {summary && summary.revenue_by_day_rupees.length > 0 ? (
              <RevenueChart data={summary.revenue_by_day_rupees} />
            ) : (
              <p className="text-sm text-inkMute py-10 text-center">No paid orders yet — complete a checkout in the store.</p>
            )}
          </section>

          {/* Opportunities */}
          <section>
            <h2 className="font-display font-semibold text-2xl tracking-tight mb-6">AI Opportunities</h2>
            {openOpps.length === 0 && <p className="text-sm text-inkMute">No open opportunities. They are generated from order history automatically.</p>}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {openOpps.map((o) => (
                <div key={o.id} className="card p-5 flex flex-col animate-fadeUp hover:border-ink transition-all duration-300">
                  <div className="flex justify-between items-center">
                    <span className="label">{o.type.replace('_', ' ')}</span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                        o.confidence >= 0.25 ? 'border-accent text-accent' : 'border-line text-inkMute'
                      }`}
                    >
                      {o.confidence >= 0.25 ? 'High impact' : 'Medium'}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-lg mt-4 leading-snug">{o.title}</h3>
                  <p className="text-sm text-inkMute mt-2 leading-relaxed flex-1">{o.reason}</p>
                  {o.expected_impact?.aov_uplift_rupees != null && (
                    <p className="font-mono text-xs text-accent mt-3">
                      Potential AOV uplift · {rupeesNum(o.expected_impact.aov_uplift_rupees)}
                    </p>
                  )}
                  <div className="flex gap-3 mt-5 pt-4 border-t border-line">
                    <button onClick={() => setReviewing(o)} className="btn-primary flex-1 !py-2">Review</button>
                    <button onClick={() => dismiss(o.id)} className="btn-ghost !py-2">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Offers */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display font-semibold text-2xl tracking-tight">Offers</h2>
              <span className="label">{proposedOffers.length} awaiting approval</span>
            </div>
            {offers.length === 0 ? (
              <p className="text-sm text-inkMute">No offers yet. Review an opportunity to create one.</p>
            ) : (
              <div className="card divide-y divide-line">
                {offers.slice(0, 8).map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className={`w-2 h-2 shrink-0 ${o.status === 'active' ? 'bg-emerald-500' : o.status === 'blocked' || o.status === 'rejected' ? 'bg-red-500' : 'bg-accent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{o.name}</p>
                      <p className="font-mono text-[11px] text-inkMute truncate">
                        {o.discount_type === 'percent' ? `${o.discount_value}% off` : 'flat'} · {o.status}
                        {o.reason ? ` · ${o.reason}` : ''}
                      </p>
                    </div>
                    {o.status === 'proposed' && (
                      <div className="flex gap-2">
                        <button onClick={() => api.post(`/api/offers/${o.id}/approve`).then(() => api.get<Offer[]>('/api/offers').then(setOffers))} className="btn-primary !py-1.5 !px-3 text-xs">Approve</button>
                        <button onClick={() => rejectOffer(o.id)} className="btn-ghost !py-1.5 !px-3 text-xs">Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-8 animate-fadeIn">
          {/* Orders */}
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="font-display font-semibold text-lg tracking-tight">Recent orders</h2>
            </div>
            <div className="divide-y divide-line max-h-[480px] overflow-y-auto">
              {orders.length === 0 && <p className="text-sm text-inkMute p-5">No orders yet.</p>}
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="font-mono text-xs">{o.id}</p>
                    <p className="font-mono text-[10px] text-inkMute mt-0.5">
                      {new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {o.ai_assisted ? ' · AI-assisted' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm">{rupees(o.amount)}</span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                        o.status === 'paid'
                          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : o.status.includes('fail')
                            ? 'border-red-500/40 text-red-500'
                            : 'border-line text-inkMute'
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Audit */}
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex justify-between items-baseline">
              <h2 className="font-display font-semibold text-lg tracking-tight">Audit trail</h2>
              <span className="label">Every agent & money action</span>
            </div>
            <div className="divide-y divide-line max-h-[480px] overflow-y-auto">
              {audit.map((a) => (
                <div key={a.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-mono text-xs">
                      <span className="text-inkMute">{a.timestamp.substring(11, 19)}</span>{' '}
                      <span className="font-medium">{a.action}</span>
                    </p>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest shrink-0 ${
                        a.policy_status === 'blocked' || a.execution_status?.includes('failed') ? 'text-red-500' : 'text-inkMute'
                      }`}
                    >
                      {a.policy_status ?? ''}{a.execution_status ? ` · ${a.execution_status}` : ''}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-inkMute mt-1">
                    {a.actor}
                    {a.entity_id ? ` → ${a.entity_id}` : ''}
                  </p>
                  {a.reason && <p className="text-xs text-inkMute mt-1 leading-relaxed">{a.reason}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {reviewing && (
        <ReviewModal
          opp={reviewing}
          onClose={(changed) => {
            setReviewing(null)
            if (changed) loadAll()
          }}
        />
      )}
    </main>
  )
}
