import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useCustomer } from '../../lib/customer'
import ProductCard from '../../components/ProductCard'
import { rupees, type CrossSellItem, type Product } from '../../types'

export default function ProductDetail() {
  const { id } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [crossSell, setCrossSell] = useState<CrossSellItem[]>([])
  const [qty, setQty] = useState(1)
  const { addToCart } = useCustomer()

  useEffect(() => {
    if (!id) return
    api.get<Product>(`/api/products/${id}`).then(setProduct).catch(() => setProduct(null))
    api.get<CrossSellItem[]>(`/api/products/${id}/cross-sell?limit=3`)
      .then((r) => setCrossSell(r.filter((x) => x.product.stock > 0)))
      .catch(() => setCrossSell([]))
  }, [id])

  if (product === null) {
    return (
      <main className="mx-auto max-w-[1400px] px-6 md:px-10 py-24">
        <p className="text-sm text-inkMute">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10 pb-28">
      <p className="label pt-10 pb-6">
        <Link to="/store" className="hover:text-accent">Store</Link> / {product.category}
      </p>

      <section className="grid lg:grid-cols-2 gap-12 animate-fadeUp">
        {/* Editorial product visual */}
        <div className="card min-h-[380px] flex flex-col justify-between p-8">
          <span className="font-display font-bold tracking-tighter text-[9rem] leading-none text-line select-none">
            {String(product.rating.toFixed(1))}
          </span>
          <div>
            <p className="label mb-2">{product.category}</p>
            <p className="font-mono text-xs text-inkMute">
              ★ {product.rating.toFixed(1)} rating · {product.stock} in stock
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <h1 className="font-display font-bold tracking-tighter text-5xl leading-[1.02]">{product.name}</h1>
          <p className="text-lg text-inkMute leading-relaxed mt-6">{product.description}</p>

          <div className="flex flex-wrap gap-2 mt-6">
            {product.tags.map((t) => (
              <span key={t} className="font-mono text-[11px] uppercase tracking-widest border border-line px-2.5 py-1 text-inkMute">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-line flex items-center justify-between">
            <span className="font-display font-bold text-4xl tracking-tight">{rupees(product.price)}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-line">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-10 hover:bg-paper">−</button>
                <span className="w-8 text-center font-mono text-sm">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(product!.stock, q + 1))} className="w-9 h-10 hover:bg-paper">+</button>
              </div>
              <button
                onClick={() => { addToCart(product, qty); }}
                disabled={product.stock <= 0}
                className="btn-primary"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      </section>

      {crossSell.length > 0 && (
        <section className="mt-20">
          <div className="flex items-baseline justify-between mb-6 border-b border-line pb-4">
            <h2 className="font-display font-semibold text-2xl tracking-tight">Frequently bought together</h2>
            <span className="label">From real order history</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {crossSell.map((cs) => (
              <div key={cs.product.id}>
                <ProductCard
                  product={cs.product}
                  href={`/store/product/${cs.product.id}`}
                  onAdd={(p) => addToCart(p)}
                />
                <p className="font-mono text-[11px] text-accent mt-2 px-1">
                  {(cs.confidence * 100).toFixed(0)}% co-purchase rate
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
