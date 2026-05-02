import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { TopBar } from './TopBar'
import { Toaster } from '@/components/ui/sonner'
import { ScrollToTop } from '@/components/shared/ScrollToTop'

/** Thin amber progress bar that sweeps across the top on every navigation */
function NavProgress() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    setVisible(true)
    setWidth(0)
    const t1 = setTimeout(() => setWidth(70), 30)
    const t2 = setTimeout(() => setWidth(90), 200)
    const t3 = setTimeout(() => {
      setWidth(100)
      setTimeout(() => setVisible(false), 200)
    }, 400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [pathname])

  if (!visible) return null
  return (
    <div
      className="fixed top-0 left-0 z-[9999] h-[2.5px] bg-amber-500 shadow-[0_0_8px_theme(colors.amber.400)]"
      style={{ width: `${width}%`, transition: 'width 0.3s ease' }}
    />
  )
}

/** Small pulsing dot in bottom-right when any query or mutation is running */
function GlobalActivityIndicator() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const active = fetching + mutating > 0
  const isMutating = mutating > 0

  if (!active) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 bg-card border-2 rounded-2xl shadow-lg shadow-black/5 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span
        className={`w-2 h-2 rounded-full animate-ping absolute inline-flex opacity-75 ${isMutating ? 'bg-amber-500' : 'bg-emerald-500'}`}
      />
      <span
        className={`w-2 h-2 rounded-full relative inline-flex ${isMutating ? 'bg-amber-500' : 'bg-emerald-500'}`}
      />
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {isMutating ? 'Saving…' : 'Syncing…'}
      </span>
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()

  return (
    <div className="flex flex-col min-h-screen">
      <NavProgress />
      <TopBar />
      <main key={pathname} className="flex-1 p-6 page-content">
        <Outlet />
      </main>
      <GlobalActivityIndicator />
      <Toaster richColors position="top-right" />
      <ScrollToTop />
    </div>
  )
}
