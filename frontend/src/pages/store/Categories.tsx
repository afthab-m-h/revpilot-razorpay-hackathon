import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useCustomer } from '../../lib/customer'
import ProductCard from '../../components/ProductCard'
import type { Product } from '../../types'

export default function Categories() {
  const [products, setProducts] = useState<Product[]>([])
  const [active, setActive] = useState<string | null>(null)
  const { addToCart } = useCustomer()

  useEffect(() => {
    api.get<Product[]>('/api/products').then(setProducts).catch(() => {})
  }, [])

  const byCategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of products) map.set(p.category, [...(map.get(p.category) ?? []), p])
    return [...map.entries()].sort()
  }, [products])

  const shown = active ? products.filter((p) => p.category === active) : []

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10 pb-28">
      <section className="pt-12 md:pt-16 pb-10 animate-fadeUp">
        <p className="label mb-5">Browse</p>
        <h1 className="font-display font-bold tracking-tighter text-5xl md:text-7xl">CATEGORIES</h1>
      </section>

      {!active && (
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-fadeUp">
          {byCategory.map(([cat, items]) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className="card group text-left p-8 min-h-[180px] flex flex-col justify-between hover:border-accent transition-all duration-300"
            >
              <div className="flex justify-between items-start">
                <span className="label">{items.length} product{items.length > 1 ? 's' : ''}</span>
                <span className="text-inkMute group-hover:text-accent group-hover:translate-x-1 transition-all">→</span>
              </div>
              <h2 className="font-display font-semibold text-2xl tracking-tight mt-6">{cat}</h2>
            </button>
          ))}
        </section>
      )}

      {active && (
        <>
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => setActive(null)} className="btn-ghost !py-2">← All categories</button>
            <h2 className="font-display font-semibold text-3xl tracking-tight">{active}</h2>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} href={`/store/product/${p.id}`} onAdd={addToCart} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
