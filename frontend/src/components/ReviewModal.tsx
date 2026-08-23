import { useState } from 'react'
import { api } from '../lib/api'
import { rupeesNum, type Opportunity } from '../types'

export default function ReviewModal({
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(!!result)} />
      <div className="relative card w-full max-w-lg animate-fadeUp shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center sticky top-0 bg-surface">
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
                <p className="font-display text-xl font-semibold mt-1">{rupeesNum(opp.expected_impact.aov_uplift_rupees)}</p>
              </div>
            )}
            {opp.proposed_action?.bundle_price_rupees != null && (
              <div className="bg-surface p-3">
                <p className="label">Bundle price</p>
                <p className="font-display text-xl font-semibold mt-1">{rupeesNum(opp.proposed_action.bundle_price_rupees)}</p>
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
