import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { useClientsCache } from '@/hooks/useClientsCache'
import { useProductsCache } from '@/hooks/useProductsCache'

import Login      from '@/pages/Login'
import Dashboard  from '@/pages/Dashboard'
import DailyBalance from '@/pages/DailyBalance'
import Sales      from '@/pages/Sales'
import Clients    from '@/pages/Clients'
import Products   from '@/pages/Products'
import Purchasing from '@/pages/Purchasing'
import Expenses   from '@/pages/Expenses'
import Whish      from '@/pages/Whish'
import Recharge   from '@/pages/Recharge'
import Internet   from '@/pages/Internet'
import Taxi       from '@/pages/Taxi'
import Inventory  from '@/pages/Inventory'
import Returns    from '@/pages/Returns'
import Shift      from '@/pages/Shift'
import Audit      from '@/pages/Audit'
import Users      from '@/pages/Users'
import Suppliers  from '@/pages/Suppliers'
import Settings   from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
})

function CacheWarmup() {
  const { session } = useAuth()
  const enabled = Boolean(session)
  useProductsCache({ enabled })
  useClientsCache({ enabled })
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CacheWarmup />
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected: ProtectedRoute guards, AppShell provides layout + Outlet */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route index                element={<Dashboard />} />
              <Route path="daily-balance"  element={<DailyBalance />} />
              <Route path="sales"         element={<Sales />} />
              <Route path="clients"       element={<Clients />} />
              <Route path="products"      element={<Products />} />
              <Route path="purchasing"    element={<Purchasing />} />
              <Route path="suppliers"     element={<Suppliers />} />
              <Route path="expenses"      element={<Expenses />} />
              <Route path="whish"         element={<Whish />} />
              <Route path="recharge"      element={<Recharge />} />
              <Route path="internet"      element={<Internet />} />
              <Route path="taxi"          element={<Taxi />} />
              <Route path="inventory"     element={<Inventory />} />
              <Route path="returns"       element={<Returns />} />
              <Route path="shift"         element={<Shift />} />
              <Route path="audit"         element={<Audit />} />
              <Route path="users"         element={<Users />} />
              <Route path="settings"      element={<Settings />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
