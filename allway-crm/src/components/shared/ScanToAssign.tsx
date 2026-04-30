/**
 * ScanToAssign — Full-screen barcode assignment station
 *
 * Workflow:
 *  1. Staff holds a product from the shelf
 *  2. Clicks its name in the left list (or searches for it)
 *  3. Scans the barcode on the product box
 *  4. System assigns the barcode → product moves to the "Done" column
 *  5. Repeat until all products have barcodes
 *
 * Also supports camera scan as a fallback (no physical scanner needed).
 */
import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useBarcode } from '@/hooks/useBarcode'
import { assignBarcode } from '@/lib/barcodeUtils'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ScanBarcode, CheckCircle2, X, Search,
  ChevronRight, AlertCircle, Zap,
} from 'lucide-react'
import type { Product } from '@/types/database'

interface ScanToAssignProps {
  products: Product[]
  onClose: () => void
  onAssigned: () => void   // triggers cache refresh
}

interface Assignment {
  productId: number
  description: string
  barcode: string
  timestamp: Date
}

export function ScanToAssign({ products, onClose, onAssigned }: ScanToAssignProps) {
  const { log } = useAuditLog()

  const [search, setSearch]               = useState('')
  const [selected, setSelected]           = useState<Product | null>(null)
  const [flash, setFlash]                 = useState(false)
  const [errorFlash, setErrorFlash]       = useState(false)
  const [sessionDone, setSessionDone]     = useState<Assignment[]>([])
  const [assignedIds, setAssignedIds]     = useState<Set<number>>(
    () => new Set(products.filter(p => p.barcode).map(p => p.id))
  )

  // Products not yet assigned (in this session or previously)
  const unassigned = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products
      .filter(p => !assignedIds.has(p.id))
      .filter(p => !term || p.description.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term))
  }, [products, assignedIds, search])

  const total       = products.length
  const doneCount   = assignedIds.size
  const progress    = Math.round((doneCount / total) * 100)

  const handleScan = useCallback(async (barcode: string) => {
    if (!selected) {
      setErrorFlash(true)
      toast.error('Select a product first — then scan its barcode', { duration: 3000 })
      setTimeout(() => setErrorFlash(false), 600)
      return
    }

    // Check if barcode already used by another product
    const { data: existing } = await supabase
      .from('products')
      .select('id, description')
      .eq('barcode', barcode)
      .neq('id', selected.id)
      .limit(1)

    if (existing && (existing as any[]).length > 0) {
      const other = (existing as any[])[0]
      setErrorFlash(true)
      toast.error(`Barcode already assigned to "${other.description}"`, { duration: 4000 })
      setTimeout(() => setErrorFlash(false), 600)
      return
    }

    const err = await assignBarcode(selected.id, barcode)
    if (err) {
      setErrorFlash(true)
      toast.error(err)
      setTimeout(() => setErrorFlash(false), 600)
      return
    }

    // Success
    const assignment: Assignment = {
      productId:   selected.id,
      description: selected.description,
      barcode,
      timestamp:   new Date(),
    }

    setFlash(true)
    setAssignedIds(prev => new Set([...prev, selected.id]))
    setSessionDone(prev => [assignment, ...prev])
    setSelected(null)
    onAssigned()

    await log('barcode_assigned', 'Products', `Barcode ${barcode} → "${selected.description}" (#${selected.id})`)
    toast.success(`✓ ${selected.description}`, { duration: 1500 })
    setTimeout(() => setFlash(false), 600)
  }, [selected, log, onAssigned])

  useBarcode({ onScan: handleScan })

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────── */}
      <div className={`flex items-center gap-4 px-6 py-4 border-b transition-colors ${
        flash      ? 'bg-green-50 border-green-200' :
        errorFlash ? 'bg-red-50 border-red-200' : 'bg-card border-border'
      }`}>
        <ScanBarcode className={`w-5 h-5 shrink-0 ${flash ? 'text-green-600' : 'text-muted-foreground'}`} />
        <div className="flex-1">
          <p className="font-display text-base font-semibold tracking-tight">Scan to Assign Mode</p>
          <p className="text-xs text-muted-foreground">
            {doneCount} of {total} products assigned ({progress}%)
          </p>
        </div>

        {/* Progress bar */}
        <div className="hidden md:flex flex-col gap-1 w-48">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">{progress}% complete</p>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Main layout ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Unassigned product list */}
        <div className="w-[55%] flex flex-col border-r">
          <div className="px-4 py-3 border-b bg-secondary/30">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products to assign…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {unassigned.length} products still need a barcode
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {unassigned.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="font-display text-lg font-semibold">All products assigned!</p>
                <p className="text-sm text-muted-foreground">Every product in this view has a barcode.</p>
                <Button onClick={onClose}>Done</Button>
              </div>
            )}
            {unassigned.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(s => s?.id === p.id ? null : p)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors flex items-center gap-3 ${
                  selected?.id === p.id
                    ? 'bg-[var(--color-gold-dim)] border-l-4 border-l-[var(--color-gold)]'
                    : 'hover:bg-secondary/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selected?.id === p.id ? 'text-[var(--color-gold)]' : ''}`}>
                    {p.description}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.category || 'No category'} · {p.brand || 'No brand'} · Qty {p.quantity ?? 0}
                  </p>
                </div>
                {selected?.id === p.id && (
                  <ChevronRight className="w-4 h-4 text-[var(--color-gold)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Scanner station */}
        <div className="w-[45%] flex flex-col">

          {/* Current target */}
          <div className={`px-6 py-5 border-b transition-all duration-300 ${
            flash      ? 'bg-green-50' :
            errorFlash ? 'bg-red-50' :
            selected   ? 'bg-[var(--color-gold-dim)]' : 'bg-secondary/30'
          }`}>
            {selected ? (
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Now assigning
                </p>
                <p className="font-display text-lg font-semibold leading-tight line-clamp-2">
                  {selected.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.category} · {selected.brand} · #{selected.id}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground px-0 mt-1"
                  onClick={() => setSelected(null)}
                >
                  ✕ Deselect
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">No product selected</p>
                  <p className="text-xs">Click a product on the left, then scan its barcode</p>
                </div>
              </div>
            )}
          </div>

          {/* Scan prompt */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
            {flash ? (
              <div className="text-center space-y-2 animate-in zoom-in-50 duration-300">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <p className="font-display text-xl font-semibold text-green-700">Assigned!</p>
              </div>
            ) : (
              <>
                <div className={`p-6 rounded-2xl border-2 border-dashed transition-colors ${
                  selected ? 'border-[var(--color-gold)] bg-[var(--color-gold-dim)]' : 'border-border bg-secondary/20'
                }`}>
                  <ScanBarcode className={`w-16 h-16 mx-auto ${selected ? 'text-[var(--color-gold)]' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium text-sm">
                    {selected ? 'Scan the barcode on the product box' : 'Select a product first'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected
                      ? 'USB scanner — point and pull trigger. Or use camera below.'
                      : 'Click any product name on the left to select it'}
                  </p>
                </div>
                <BarcodeCamera
                  onScan={handleScan}
                  label="Use camera instead"
                  hint=""
                  className={selected ? '' : 'opacity-50 pointer-events-none'}
                />
              </>
            )}
          </div>

          {/* Session log */}
          {sessionDone.length > 0 && (
            <div className="border-t max-h-48 overflow-y-auto">
              <div className="px-4 py-2 bg-secondary/30 flex items-center gap-2">
                <Zap className="w-3 h-3 text-green-600" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  This session — {sessionDone.length} assigned
                </p>
              </div>
              {sessionDone.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-green-50/40">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.description}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{a.barcode}</p>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">
                    {a.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
