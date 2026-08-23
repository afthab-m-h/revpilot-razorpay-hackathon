import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCustomer } from '../../lib/customer'
import CheckoutModal from '../../components/CheckoutModal'
import { useState } from 'react'
import { api } from '../../lib/api'
import { rupees, type CheckoutResponse, type Order } from '../../types'

export default function CartPage() {
  const { cart, total, setQuantity, removeFromCart, clearCart } = useCustomer()
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  async function startCheckout() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<CheckoutResponse>('/api/orders/checkout', {
        customer_id: 'cust_00001',
        items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      })
      setCheckout(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const lines = useMemo(() => cart, [cart])

  return (
    <main className="mx-auto max-w-[1100px] px-6 md:px-10 pb-28">
      <section className="pt-12 md:pt-16 pb-10 animate-fadeUp">
        <p className="label mb-5">Checkout</p>
        <h1 className="font-display font-bold tracking-tighter text-5xl md:text-7xl">YOUR CART</h1>
      </section>

      {lines.length === 0 ? (
        <div className="card p-12 text-center animate-fadeUp">
          <p className="text-inkMute">Your cart is empty.</p>
          <Link to="/store" className="btn-primary mt-6 inline-flex">Browse the store</Link>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-line animate-fadeUp">
            {lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-5 px-6 py-5">
                <div className="flex-1 min-w-0">
                  <Link to={`/store/product/${l.product.id}`} className="font-display font-semibold hover:text-accent transition-colors">
                    {l.product.name}
                  </Link>
                  <p className="label mt-1">{rupees(l.product.price)} each · {l.product.category}</p>
                </div>
                <div className="flex items-center border border-line shrink-0">
                  <button onClick={() => setQuantity(l.product.id, l.quantity - 1)} className="w-9 h-10 hover:bg-paper">−</button>
                  <span className="w-8 text-center font-mono text-sm">{l.quantity}</span>
                  <button onClick={() => setQuantity(l.product.id, Math.min(l.product.stock, l.quantity + 1))} className="w-9 h-10 hover:bg-paper">+</button>
                </div>
                <span className="font-display text-lg font-semibold w-28 text-right tabular-nums">
                  {rupees(l.product.price * l.quantity)}
                </span>
                <button onClick={() => removeFromCart(l.product.id)} className="font-mono text-xs text-inkMute hover:text-red-500 transition-colors">✕</button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-6 mt-8 pt-6 border-t border-line">
            <button onClick={clearCart} className="btn-ghost">Clear cart</button>
            <div className="text-right">
              <p className="label mb-1">Total</p>
              <p className="font-display font-bold text-4xl tracking-tight">{rupees(total)}</p>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
          <button onClick={startCheckout} disabled={busy} className="btn-primary mt-6 w-full !py-4 !text-base">
            {busy ? 'Creating order…' : `Checkout · ${rupees(total)}`}
          </button>
          <p className="label text-center mt-3">Simulated gateway · policy-checked · fully audited</p>
        </>
      )}

      {checkout && (
        <CheckoutModal
          checkout={checkout}
          onClose={() => setCheckout(null)}
          onPaid={clearCart}
          onDone={(o: Order) => { clearCart(); nav('/store/orders') }}
        />
      )}
    </main>
  )
}
