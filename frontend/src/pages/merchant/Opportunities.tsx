import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import ReviewModal from '../../components/ReviewModal'
import { rupeesNum, type Offer, type Opportunity } from '../../types'

export default function Opportunities() {
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [reviewing, setReviewing] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    Promise.all([
      api.get<Opportunity[]>('/api/analytics/opportunities?refresh=true'),
      api.get<Offer[]>('/api/offers'),
    ])
      .then(([o, of]) => { setOpps(o); setOffers(of) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  async function dismiss(id: string) {
    await api.post(`/api/opportunities/${id}/dismiss`)
    setOpps((x) => x.filter((o) => o.id !== id))
  }

  const open = opps.filter((o) => o.status === 'open')
  const proposedOffers = offers.filter((o) => o.status === 'proposed')

  return (
    <div className="space-y-12 animate-fadeIn">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6 border-b border-line pb-4">
          <h2 className="font-display font-semibold text-2xl tracking-tight">
            Detected opportunities <span className="text-accent">{open.length}</span>
          </h2>
          <button onClick={load} className="btn-ghost !py-2">Re-scan data</button>
        </div>

        {loading && <p className="text-sm text-inkMute">Scanning order history…</p>}
        {!loading && open.length === 0 && (
          <p className="text-sm text-inkMute">No open opportunities right now. They are generated automatically from order and browsing data.</p>
        )}

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {open.map((o) => (
            <div key={o.id} className="card p-5 flex flex-col animate-fadeUp hover:border-ink transition-all duration-300">
              <div className="flex justify-between items-center">
                <span className="label">{o.type.replace('_', ' ')}</span>
                <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                  o.confidence >= 0.25 ? 'border-accent text-accent' : 'border-line text-inkMute'
                }`}>
                  {o.confidence >= 0.25 ? 'High impact' : 'Medium'}
                </span>
              </div>
              <h3 className="font-display font-semibold text-lg mt-4 leading-snug">{o.title}</h3>
              <p className="text-sm text-inkMute mt-2 leading-relaxed flex-1">{o.reason}</p>
              {o.expected_impact?.aov_uplift_rupees != null && (
                <p className="font-mono text-xs text-accent mt-3">AOV uplift · {rupeesNum(o.expected_impact.aov_uplift_rupees)}</p>
              )}
              <div className="flex gap-3 mt-5 pt-4 border-t border-line">
                <button onClick={() => setReviewing(o)} className="btn-primary flex-1 !py-2">Review</button>
                <button onClick={() => dismiss(o.id)} className="btn-ghost !py-2">Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-6 border-b border-line pb-4">
          <h2 className="font-display font-semibold text-2xl tracking-tight">Offers & approvals</h2>
          <span className="label">{proposedOffers.length} awaiting merchant decision</span>
        </div>

        {offers.length === 0 ? (
          <p className="text-sm text-inkMute">No offers yet — review an opportunity above to create one.</p>
        ) : (
          <div className="card divide-y divide-line">
            {offers.slice(0, 12).map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className={`w-2 h-2 shrink-0 ${
                  o.status === 'active' ? 'bg-emerald-500'
                  : o.status === 'blocked' || o.status === 'rejected' ? 'bg-red-500' : 'bg-accent animate-pulse'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{o.name}</p>
                  <p className="font-mono text-[11px] text-inkMute truncate">
                    {o.discount_type === 'percent' ? `${o.discount_value}% off` : 'flat discount'}
                    {o.bundle_price ? ` · bundle ${rupeesNum(o.bundle_price)}` : ''} · {o.status}
                    {o.reason ? ` · ${o.reason}` : ''}
                  </p>
                </div>
                {o.status === 'proposed' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => api.post(`/api/offers/${o.id}/approve`).then(load)}
                      className="btn-primary !py-1.5 !px-3 text-xs"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => api.post(`/api/offers/${o.id}/reject`).then(load)}
                      className="btn-ghost !py-1.5 !px-3 text-xs"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {reviewing && (
        <ReviewModal
          opp={reviewing}
          onClose={(changed) => { setReviewing(null); if (changed) load() }}
        />
      )}
    </div>
  )
}
