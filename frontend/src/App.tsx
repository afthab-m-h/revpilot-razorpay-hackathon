import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import { CustomerProvider } from './lib/customer'
import Nav from './components/Nav'
import Landing from './pages/Landing'
import Catalog from './pages/store/Catalog'
import Categories from './pages/store/Categories'
import ProductDetail from './pages/store/ProductDetail'
import CartPage from './pages/store/CartPage'
import OrdersPage from './pages/store/Orders'
import Overview from './pages/merchant/Overview'
import Products from './pages/merchant/Products'
import Sales from './pages/merchant/Sales'
import Opportunities from './pages/merchant/Opportunities'
import Reports from './pages/merchant/Reports'
import Audit from './pages/merchant/Audit'

export default function App() {
  return (
    <ThemeProvider>
      <CustomerProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <Nav />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/store" element={<Catalog />} />
                <Route path="/store/product/:id" element={<ProductDetail />} />
                <Route path="/store/categories" element={<Categories />} />
                <Route path="/store/cart" element={<CartPage />} />
                <Route path="/store/orders" element={<OrdersPage />} />
                <Route path="/merchant" element={<Overview />} />
                <Route path="/merchant/products" element={<Products />} />
                <Route path="/merchant/sales" element={<Sales />} />
                <Route path="/merchant/opportunities" element={<Opportunities />} />
                <Route path="/merchant/reports" element={<Reports />} />
                <Route path="/merchant/audit" element={<Audit />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <footer className="border-t border-line py-6">
              <p className="mx-auto max-w-[1400px] px-6 md:px-10 label">
                RevPilot · AI revenue agents · bounded · gated · auditable — simulated payments only
              </p>
            </footer>
          </div>
        </BrowserRouter>
      </CustomerProvider>
    </ThemeProvider>
  )
}
