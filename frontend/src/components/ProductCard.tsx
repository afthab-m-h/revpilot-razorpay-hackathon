import { Link } from 'react-router-dom'
import { rupees, type Product } from '../types'

export default function ProductCard({
  product,
  onAdd,
  href,
}: {
  product: Product
  onAdd?: (p: Product) => void
  href?: string
}) {
  const name = href ? (
    <Link to={href} className="hover:text-accent transition-colors">{product.name}</Link>
  ) : (
    product.name
  )

  return (
    <div className="card group p-5 flex flex-col animate-fadeUp hover:border-ink transition-all duration-300">
      <div className="flex justify-between items-start">
        {href ? (
          <Link to={href} className="label hover:text-accent transition-colors">{product.category}</Link>
        ) : (
          <span className="label">{product.category}</span>
        )}
        <span className="font-mono text-xs text-inkMute">★ {product.rating.toFixed(1)}</span>
      </div>
      <h3 className="font-display font-semibold text-lg mt-4 leading-snug">{name}</h3>
      <p className="text-sm text-inkMute mt-2 leading-relaxed line-clamp-2 flex-1">{product.description}</p>
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-line">
        <span className="font-display text-xl font-semibold tracking-tight">{rupees(product.price)}</span>
        {onAdd && (
          <button
            onClick={() => onAdd(product)}
            disabled={product.stock <= 0}
            className="font-mono text-[11px] uppercase tracking-[0.16em] border border-line px-3 py-2
              hover:bg-accent hover:border-accent hover:text-white dark:hover:text-white
              transition-all duration-200 active:scale-95 disabled:opacity-30"
          >
            {product.stock > 0 ? 'Add to cart' : 'Sold out'}
          </button>
        )}
      </div>
    </div>
  )
}
