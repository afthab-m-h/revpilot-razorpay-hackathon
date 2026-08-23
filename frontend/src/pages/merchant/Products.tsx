import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { rupees, type Product } from '../../types'

interface FormState {
  id?: string
  name: string
  description: string
  category: string
  priceRupees: string
  stock: string
  rating: string
}

const EMPTY: FormState = { name: '', description: '', category: '', priceRupees: '', stock: '0', rating: '4.0' }

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get<Product[]>('/api/products?limit=200').then(setProducts).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function save() {
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        category: form.category,
        price_paise: Math.round(parseFloat(form.priceRupees || '0') * 100),
        stock: parseInt(form.stock || '0', 10),
        rating: parseFloat(form.rating || '0'),
        tags: [],
      }
      if (form.id) {
        await api.patch(`/api/merchant/products/${form.id}`, payload)
      } else {
        await api.post('/api/merchant/products', payload)
      }
      setForm(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function adjustStock(p: Product, delta: number) {
    await api.post(`/api/merchant/products/${p.id}/stock`, { stock_delta: delta })
    load()
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? Products with order history are retired instead.`)) return
    await api.del(`/api/merchant/products/${p.id}`)
    load()
  }

  function edit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      priceRupees: String(p.price / 100),
      stock: String(p.stock),
      rating: String(p.rating),
    })
  }

  const lowStock = products.filter((p) => p.stock < 50).length

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="label">
          {products.length} products · <span className="text-accent">{lowStock} low stock</span>
        </p>
        <button onClick={() => setForm(EMPTY)} className="btn-primary">+ Add product</button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-line text-left">
              {['Product', 'Category', 'Price', 'Rating', 'Stock', ''].map((h) => (
                <th key={h} className="label font-normal px-5 py-3.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-paper transition-colors">
                <td className="px-5 py-3.5">
                  <p className="font-medium">{p.name}</p>
                  <p className="font-mono text-[10px] text-inkMute mt-0.5">{p.id}</p>
                </td>
                <td className="px-5 py-3.5 text-inkMute">{p.category}</td>
                <td className="px-5 py-3.5 font-mono">{rupees(p.price)}</td>
                <td className="px-5 py-3.5 font-mono">★ {p.rating.toFixed(1)}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjustStock(p, -10)} className="w-6 h-6 border border-line hover:border-accent text-xs">−</button>
                    <span className={`font-mono w-10 text-center ${p.stock === 0 ? 'text-red-500' : p.stock < 50 ? 'text-accent' : ''}`}>
                      {p.stock}
                    </span>
                    <button onClick={() => adjustStock(p, 10)} className="w-6 h-6 border border-line hover:border-accent text-xs">+</button>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => edit(p)} className="font-mono text-[11px] uppercase tracking-widest border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition-all">
                      Edit
                    </button>
                    <button onClick={() => remove(p)} className="font-mono text-[11px] uppercase tracking-widest border border-line px-3 py-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10 transition-all">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / edit modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="relative card w-full max-w-lg animate-fadeUp shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-line flex justify-between items-center">
              <p className="label">{form.id ? `Edit product · ${form.id}` : 'New product'}</p>
              <button onClick={() => setForm(null)} className="font-mono text-xs text-inkMute hover:text-ink">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {([['name', 'Name'], ['category', 'Category'], ['description', 'Description']] as const).map(([k, label]) => (
                <div key={k}>
                  <p className="label mb-1.5">{label}</p>
                  {k === 'description' ? (
                    <textarea value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={3} className="input resize-none" />
                  ) : (
                    <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="input" />
                  )}
                </div>
              ))}
              <div className="grid grid-cols-3 gap-4">
                {([['priceRupees', 'Price (₹)'], ['stock', 'Stock'], ['rating', 'Rating']] as const).map(([k, label]) => (
                  <div key={k}>
                    <p className="label mb-1.5">{label}</p>
                    <input
                      type="number"
                      value={form[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      className="input"
                    />
                  </div>
                ))}
              </div>
              <button onClick={save} disabled={busy} className="btn-primary w-full">
                {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
