import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { Toaster } from '@/components/ui/sonner'
import { ScrollToTop } from '@/components/shared/ScrollToTop'

export function AppShell() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
      <ScrollToTop />
    </div>
  )
}
