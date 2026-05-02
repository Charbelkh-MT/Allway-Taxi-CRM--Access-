/** Full-page loading skeleton — shown while Dashboard metrics are fetching */
export function PageLoader() {
  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div className="space-y-3">
          <div className="h-3 w-28 bg-secondary animate-pulse rounded-full" />
          <div className="h-9 w-72 bg-secondary animate-pulse rounded-2xl" />
          <div className="h-3 w-48 bg-secondary animate-pulse rounded-full opacity-60" />
        </div>
        <div className="h-12 w-36 bg-secondary animate-pulse rounded-2xl" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-6 bg-background border-2 rounded-3xl space-y-4"
            style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 bg-secondary animate-pulse rounded-xl" />
              <div className="w-4 h-4 bg-secondary animate-pulse rounded-full opacity-30" />
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-20 bg-secondary animate-pulse rounded-full" />
              <div className="h-7 w-24 bg-secondary animate-pulse rounded-xl" />
              <div className="h-2 w-16 bg-secondary animate-pulse rounded-full opacity-50" />
            </div>
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-3xl border-2 overflow-hidden">
            <div className="p-4 border-b bg-secondary/30">
              <div className="h-3 w-28 bg-secondary animate-pulse rounded-full" />
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-secondary animate-pulse rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-8">
          <div className="rounded-3xl border-2 overflow-hidden">
            <div className="p-4 border-b bg-secondary/30 flex justify-between">
              <div className="h-3 w-32 bg-secondary animate-pulse rounded-full" />
              <div className="h-3 w-20 bg-secondary animate-pulse rounded-full" />
            </div>
            <div className="divide-y">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-secondary animate-pulse rounded-xl" />
                    <div className="space-y-2">
                      <div className="h-3 w-28 bg-secondary animate-pulse rounded-full" />
                      <div className="h-2 w-16 bg-secondary animate-pulse rounded-full opacity-60" />
                    </div>
                  </div>
                  <div className="h-3 w-16 bg-secondary animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
