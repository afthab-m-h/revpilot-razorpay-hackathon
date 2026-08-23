import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { rupees, type Order, type Product } from '../../types'

const STATUS_STYLE: Record<string, string> = {
  paid: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  payment_failed: 'border-red-500/40 text-red-500',
  created: 'border-line text-inkMute',
  authorized: 'border-line text-inkMute',
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Order[]>('/api/orders?customer_id=cust_00001&limit=50'),
      api.get<Product[]>('/api/products'),
    ])
      .then(([os, ps]) => {
        setOrders(os)
        setProducts(Object.fromEntries(ps.map((p) => [p.id, p])))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="mx-auto max-w-[1100px] px-6 md:px-10 pb-28">
      <section className="pt-12 md:pt-16 pb-10 animate-fadeUp">
        <p className="label mb-5">Session · cust_00001</p>
        <h1 className="font-display font-bold tracking-tighter text-5xl md:text-7xl">YOUR ORDERS</h1>
      </section>

      {loading && <p className="text-sm text-inkMute">Loading…</p>}

      {!loading && orders.length === 0 && (
        <div className="card p-12 text-center animate-fadeUp">
          <p className="text-inkMute">No orders yet.</p>
          <Link to="/store" className="btn-primary mt-6 inline-flex">Start shopping</Link>
        </div>
      )}

      <div className="space-y-5">
        {orders.map((o) => {
          const paid = o.status === 'paid'
          return (
            <div key={o.id} className={`card p-6 animate-fadeUp ${paid ? '' : 'opacity-90'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-line">
                <div>
                  <p className="font-mono text-sm font-medium">{o.id}</p>
                  <p className="label mt-1">
                    {new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    {o.ai_assisted ? ' · AI-assisted purchase' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${STATUS_STYLE[o.status] ?? 'border-line text-inkMute'}`}
                  >
                    {o.status.replace('_', ' ')}
                  </span>
                  <span className="font-display text-2xl font-bold tracking-tight">{rupees(o.amount)}</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {(o.items ?? []).map((i, idx) => (
                  <div key={idx} className="flex justify-between items-center border border-line px-4 py-3">
                    <span className="text-sm truncate pr-2">{products[i.product_id]?.name ?? i.product_id}</span>
                    <span className="font-mono text-xs text-inkMute shrink-0">×{i.quantity}</span>
                  </div>
                ))}
              </div>
              {!paid && o.status !== 'created' && (
                <p className="text-xs text-red-500/80 mt-3 font-mono uppercase tracking-widest">
                  Payment not completed — order not fulfilled
                </p>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
