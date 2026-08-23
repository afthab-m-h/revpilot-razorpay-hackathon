import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CrossSellItem, Product } from '../types'

export const DEMO_CUSTOMER = 'cust_00001'

export interface CartLine {
  product: Product
  quantity: number
}

interface CustomerCtx {
  cart: CartLine[]
  total: number
  addToCart: (p: Product, qty?: number) => void
  setQuantity: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  crossSell: { for: string; items: CrossSellItem[] } | null
}

const Ctx = createContext<CustomerCtx | null>(null)

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [crossSell, setCrossSell] = useState<CustomerCtx['crossSell']>(null)

  const value = useMemo<CustomerCtx>(() => ({
    cart,
    total: cart.reduce((s, l) => s + l.product.price * l.quantity, 0),
    crossSell,
    addToCart: (p, qty = 1) => {
      setCart((c) => {
        const found = c.find((l) => l.product.id === p.id)
        if (found) return c.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + qty } : l))
        return [...c, { product: p, quantity: qty }]
      })
      fetch(`/api/products/${p.id}/cross-sell?limit=2`)
        .then((r) => r.json())
        .then((items: CrossSellItem[]) =>
          setCrossSell({ for: p.name, items: items.filter((i) => i.product.stock > 0 && i.confidence > 0.05) }))
        .catch(() => setCrossSell(null))
    },
    setQuantity: (productId, qty) =>
      setCart((c) => (qty <= 0
        ? c.filter((l) => l.product.id !== productId)
        : c.map((l) => (l.product.id === productId ? { ...l, quantity: qty } : l)))),
    removeFromCart: (productId) => setCart((c) => c.filter((l) => l.product.id !== productId)),
    clearCart: () => { setCart([]); setCrossSell(null) },
  }), [cart, crossSell])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCustomer() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCustomer must be used within CustomerProvider')
  return ctx
}
