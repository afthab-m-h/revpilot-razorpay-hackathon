import { useState } from 'react'
import { api } from '../lib/api'
import { rupees, type CheckoutResponse, type Order } from '../types'

type Phase = 'review' | 'gateway' | 'processing' | 'paid' | 'failed'

export default function CheckoutModal({
  checkout,
  onClose,
  onDone,
  onPaid,
}: {
  checkout: CheckoutResponse
  onClose: () => void
  onDone: (order: Order) => void
  onPaid?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('gateway')
  const [error, setError] = useState<string | null>(null)

  async function pay(outcome: 'success' | 'failure') {
    setPhase('processing')
    setError(null)
    try {
      const res = await api.post<{ status: string }>('/api/payments/simulate', {
        order_id: checkout.order.id,
        outcome,
      })
      if (res.status === 'paid') {
        setPhase('paid')
        onPaid?.()
      } else {
        setPhase('failed')
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('gateway')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose} />

      <div className="relative card w-full max-w-md animate-fadeUp shadow-2xl">
        {/* Mock gateway chrome */}
        <div className="px-5 py-3 border-b border-line flex items-center justify-between bg-paper">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-inkMute">
            Sandbox Checkout · MockPaymentProvider
          </span>
          <button onClick={onClose} className="font-mono text-xs text-inkMute hover:text-ink">✕</button>
        </div>

        {phase === 'gateway' && (
          <div className="p-6">
            <p className="label">Order {checkout.order.id}</p>
            <div className="mt-4 space-y-2 border-b border-line pb-4">
              {checkout.order.items?.map((i) => (
                <div key={i.product_id} className="flex justify-between text-sm">
                  <span className="text-inkMute">{i.product_name ?? i.product_id}</span>
                  <span>{rupees(i.unit_price)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between py-4 font-display text-lg font-semibold">
              <span>Amount payable</span>
              <span>{rupees(checkout.amount)}</span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-inkMute mb-5">
              Provider order · {checkout.razorpay_order_id}
            </p>
            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => pay('failure')} className="btn-ghost">Simulate failure</button>
              <button onClick={() => pay('success')} className="btn-primary">Pay now</button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="p-12 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-line border-t-accent rounded-full animate-spin" />
            <p className="label mt-6">Verifying signature · awaiting webhook</p>
          </div>
        )}

        {phase === 'paid' && (
          <div className="p-8 text-center animate-fadeUp">
            <div className="w-12 h-12 mx-auto bg-accent flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <path d="M4 12l6 6L20 6" />
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl mt-5">Payment captured</h3>
            <p className="text-sm text-inkMute mt-2">
              Order <span className="font-mono">{checkout.order.id}</span> marked PAID via verified webhook.
              Stock updated. Revenue recorded.
            </p>
            <button onClick={() => onDone(checkout.order)} className="btn-primary mt-6 w-full">Continue shopping</button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="p-8 text-center animate-fadeUp">
            <div className="w-12 h-12 mx-auto border-2 border-red-500 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl mt-5">Payment failed</h3>
            <p className="text-sm text-inkMute mt-2">
              The gateway reported a failed payment. Order{' '}
              <span className="font-mono">{checkout.order.id}</span> remains <b>not fulfilled</b> — no revenue recorded.
            </p>
            <button onClick={onClose} className="btn-ghost mt-6 w-full">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
