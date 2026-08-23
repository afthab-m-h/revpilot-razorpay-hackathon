import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import ProductCard from '../components/ProductCard'
import ChatPanel from '../components/ChatPanel'
import CheckoutModal from '../components/CheckoutModal'
import { rupees, type CheckoutResponse, type CrossSellItem, type Order, type Product } from '../types'

interface CartLine {
  product: Product
  quantity: number
}

const DEMO_CUSTOMER = 'cust_00001'

export default function Store() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [crossSell, setCrossSell] = useState<{ for: string; items: CrossSellItem[] } | null>(null)
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    api.get<Product[]>('/api/products').then(setProducts).catch((e) => setError(e.message))
  }, [])

  const total = useMemo(() => cart.reduce((s, l) => s + l.product.price * l.quantity, 0), [cart])

  function addToCart(p: Product) {
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id)
      if (found) return c.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      return [...c, { product: p, quantity: 1 }]
    })
    // Data-driven cross-sell straight from order history
    api.get<CrossSellItem[]>(`/api/products/${p.id}/cross-sell?limit=2`)
      .then((items) => setCrossSell({ for: p.name, items: items.filter((i) => i.product.stock > 0) }))
      .catch(() => setCrossSell(null))
  }

  function addCrossSell(item: CrossSellItem) {
    addToCart(item.product)
    setCrossSell(null)
  }

  async function startCheckout() {
    setCheckingOut(true)
    setError(null)
    try {
      const res = await api.post<CheckoutResponse>('/api/orders/checkout', {
        customer_id: DEMO_CUSTOMER,
        items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      })
      setCheckout(res)
      setCart([])
      setCrossSell(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10 pb-32">
      {/* Hero */}
      <section className="pt-16 md:pt-24 pb-14 border-b border-line animate-fadeUp">
        <p className="label mb-6">StrideX · Running &amp; Fitness · Agentic Commerce Demo</p>
        <h1 className="font-display font-bold tracking-tighter leading-[0.95] text-[13vw] md:text-[7.5rem]">
          TRAIN WITH
          <br />
          <span className="text-accent">INTELLIGENCE.</span>
        </h1>
        <p className="mt-8 max-w-xl text-inkMute leading-relaxed">
          An AI agent reads the live catalog, reasons over your goal and budget, then recommends gear backed by
          real co-purchase data — checked out through a policy-gated payment pipeline.
        </p>
      </section>

      {/* Store grid + chat */}
      <section className="grid lg:grid-cols-[1fr_400px] gap-10 pt-12">
        <div>
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="font-display font-semibold text-2xl tracking-tight">The Catalog</h2>
            <span className="label">{products.length} products</span>
          </div>
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={addToCart} />
            ))}
          </div>
        </div>

        <aside>
          <ChatPanel />
        </aside>
      </section>

      {/* Cross-sell strip */}
      {crossSell && crossSell.items.length > 0 && (
        <section className="fixed bottom-20 inset-x-0 z-30 animate-fadeUp">
          <div className="mx-auto max-w-[1400px] px-6 md:px-10">
            <div className="card mx-auto max-w-2xl p-4 shadow-2xl border-l-2 border-l-accent flex items-center gap-4 overflow-x-auto">
              <div className="shrink-0">
                <p className="label">Frequently bought with</p>
                <p className="text-sm font-medium mt-1">{crossSell.for}</p>
              </div>
              {crossSell.items.map((cs) => (
                <button
                  key={cs.product.id}
                  onClick={() => addCrossSell(cs)}
                  title={cs.reason}
                  className="shrink-0 text-left border border-line hover:border-accent transition-all duration-200 p-3 w-56 active:scale-[0.98]"
                >
                  <p className="text-sm font-medium leading-tight">{cs.product.name}</p>
                  <p className="font-mono text-[11px] mt-1.5 text-accent">
                    {rupees(cs.product.price)} · {(cs.confidence * 100).toFixed(0)}% affinity
                  </p>
                </button>
              ))}
              <button onClick={() => setCrossSell(null)} className="ml-auto shrink-0 font-mono text-xs text-inkMute hover:text-ink">✕</button>
            </div>
          </div>
        </section>
      )}

      {/* Cart bar */}
      {cart.length > 0 && !checkout && (
        <section className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-paper/95 backdrop-blur animate-fadeUp">
          <div className="mx-auto max-w-[1400px] px-6 md:px-10 py-4 flex items-center justify-between gap-6">
            <div className="flex items-center gap-6 min-w-0">
              <span className="label shrink-0">Cart · {cart.reduce((s, l) => s + l.quantity, 0)} items</span>
              <div className="hidden md:flex items-center gap-3 overflow-x-auto">
                {cart.map((l) => (
                  <span key={l.product.id} className="shrink-0 font-mono text-xs text-inkMute border border-line px-2 py-1">
                    {l.product.name} ×{l.quantity}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <span className="font-display text-lg font-semibold">{rupees(total)}</span>
              <button onClick={startCheckout} disabled={checkingOut} className="btn-primary">
                {checkingOut ? 'Creating order…' : 'Checkout'}
              </button>
            </div>
          </div>
        </section>
      )}

      {checkout && (
        <CheckoutModal
          checkout={checkout}
          onClose={() => setCheckout(null)}
          onDone={() => setCheckout(null)}
        />
      )}
    </main>
  )
}

export type { Order }
