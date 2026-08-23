import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import ProductCard from '../../components/ProductCard'
import ChatPanel from '../../components/ChatPanel'
import { useCustomer } from '../../lib/customer'
import type { Product } from '../../types'

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { addToCart } = useCustomer()

  useEffect(() => {
    api.get<Product[]>('/api/products').then(setProducts).catch((e) => setError(e.message))
  }, [])

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  )

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (category && p.category !== category) return false
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      }),
    [products, query, category],
  )

  return (
    <main className="mx-auto max-w-[1400px] px-6 md:px-10 pb-28">
      <section className="pt-12 md:pt-16 pb-10 animate-fadeUp">
        <p className="label mb-5">StrideX · Running &amp; Fitness</p>
        <h1 className="font-display font-bold tracking-tighter leading-[0.95] text-5xl md:text-7xl">
          THE CATALOG
        </h1>
      </section>

      {/* Search + filters */}
      <section className="flex flex-wrap gap-3 items-center mb-10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gear, tags…"
          className="input max-w-xs"
        />
        <button
          onClick={() => setCategory(null)}
          className={`font-mono text-[11px] uppercase tracking-[0.16em] border px-3 py-2 transition-all ${
            category === null ? 'border-accent text-accent' : 'border-line text-inkMute hover:text-ink'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? null : c)}
            className={`font-mono text-[11px] uppercase tracking-[0.16em] border px-3 py-2 transition-all ${
              category === c ? 'border-accent text-accent' : 'border-line text-inkMute hover:text-ink'
            }`}
          >
            {c}
          </button>
        ))}
        <span className="label ml-auto">{filtered.length} shown</span>
      </section>

      <section className="grid lg:grid-cols-[1fr_380px] gap-10 items-start">
        <div>
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                href={`/store/product/${p.id}`}
                onAdd={addToCart}
              />
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <p className="text-sm text-inkMute">Nothing matches that search.</p>
          )}
        </div>

        <aside className="lg:sticky lg:top-24">
          <ChatPanel />
        </aside>
      </section>
    </main>
  )
}
