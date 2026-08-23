import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import Nav from './components/Nav'
import Store from './pages/Store'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col">
          <Nav />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Store />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Routes>
          </div>
          <footer className="border-t border-line py-6">
            <p className="mx-auto max-w-[1400px] px-6 md:px-10 label">
              RevPilot · AI revenue agent · bounded · gated · auditable — simulated payments only
            </p>
          </footer>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  )
}
