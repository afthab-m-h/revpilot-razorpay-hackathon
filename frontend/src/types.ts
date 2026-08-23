export interface Product {
  id: string
  name: string
  description: string
  category: string
  price: number // paise
  stock: number
  rating: number
  tags: string[]
}

export interface OrderItem {
  product_id: string
  quantity: number
  unit_price: number
}

export interface Order {
  id: string
  customer_id: string | null
  razorpay_order_id: string | null
  amount: number
  discount_amount: number
  status: string
  ai_assisted: boolean
  created_at: string
  items?: { product_id: string; product_name?: string; quantity: number; unit_price: number }[]
}

export interface CheckoutResponse {
  order: Order
  razorpay_order_id: string | null
  key_id: string
  amount: number
  currency: string
}

export interface ChatTraceStep {
  message: string
}

export interface ChatResponse {
  session_id: string
  reply: string
  trace: ChatTraceStep[]
}

export interface RevenueSummary {
  revenue_rupees: number
  orders: number
  aov_rupees: number
  conversion_rate_percent: number
  ai_assisted_orders: number
  ai_attributed_revenue_rupees: number
  revenue_by_day_rupees: { date: string; revenue: number }[]
}

export interface Opportunity {
  id: string
  type: string
  title: string
  target: string | null
  related_target: string | null
  reason: string | null
  confidence: number
  expected_impact: Record<string, number> | null
  proposed_action: { kind?: string; bundle_price_rupees?: number; original_price_rupees?: number; discount_percent?: number } | null
  status: string
}

export interface Offer {
  id: string
  name: string
  discount_type: string
  discount_value: number
  status: string
  policy_status: string | null
  approval_status: string | null
  reason: string | null
  applies_to_product_ids?: string[]
  bundle_price?: number | null
}

export interface AuditEntry {
  id: number
  timestamp: string
  actor: string
  action: string
  entity_type: string | null
  entity_id: string | null
  reason: string | null
  policy_status: string | null
  approval_status: string | null
  execution_status: string | null
}

export interface CrossSellItem {
  product: Product
  confidence: number
  co_purchases: number
  reason: string
}

export const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)

export const rupeesNum = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
