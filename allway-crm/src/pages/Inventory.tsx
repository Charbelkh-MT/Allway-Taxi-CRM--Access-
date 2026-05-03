import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useProductsCache } from '@/hooks/useProductsCache'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { useBarcode } from '@/hooks/useBarcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { ClipboardCheck, Plus, TrendingUp, AlertTriangle, CheckCircle2, Box, Search, ShieldAlert, ArrowUpRight, PlusCircle } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'

const QK = ['inventory_checks']

export default function Inventory() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin'
  const { data: products = [] } = useProductsCache()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [productName, setProductName] = useState('')
  const [systemQty, setSystemQty] = useState(0)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')

  const diff = counted !== '' ? parseInt(counted) - systemQty : null

  useEffect(() => {
    const match = products.find(p => p.description === productName)
    setSystemQty(match?.quantity ?? 0)
  }, [productName, products])

  const checksQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('inventory_checks').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = checksQuery.data ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    const todayChecks = data.filter(c => c.created_at.startsWith(todayStr))
    const mismatches = todayChecks.filter(c => c.difference !== 0).length
    
    return {
      todayCount: todayChecks.length,
      mismatchCount: mismatches
    }
  }, [checksQuery.data])

  const filteredChecks = useMemo(() => {
    const data = checksQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(c => 
      c.product_name.toLowerCase().includes(s) || 
      c.checked_by.toLowerCase().includes(s)
    )
  }, [checksQuery.data, search])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isSup) throw new Error('Only admins can submit inventory checks')
      if (!productName.trim()) throw new Error('Please select a product to check')
      
      const match = products.find(p => p.description === productName)
      const cntd = parseInt(counted) || 0
      const d = cntd - systemQty
      
      const { error } = await (supabase as any).from('inventory_checks').insert({
        product_id: match?.id ?? null, 
        product_name: productName.trim(),
        system_qty: systemQty, 
        counted_qty: cntd, 
        difference: d,
        checked_by: profile?.name ?? 'system', 
        station: profile?.station ?? '', 
        note: note.trim(),
      })
      
      if (error) throw error
      const msg = d !== 0 ? `Mismatch — ${productName}: system ${systemQty} counted ${cntd} diff ${d}` : `Check OK — ${productName} qty ${systemQty}`
      await log(d !== 0 ? 'inventory_mismatch' : 'inventory_ok', 'Inventory', msg)
      return d
    },
    onSuccess: (d) => {
      if (d !== null && d < 0) toast.warning(`Shortage detected! Difference: ${d}`, { duration: 5000 })
      else if (d !== null && d > 0) toast.warning(`Surplus detected. Difference: +${d}`, { duration: 5000 })
      else toast.success('✓ Inventory matches system records')
      
      void queryClient.invalidateQueries({ queryKey: QK })
      setProductName(''); setSystemQty(0); setCounted(''); setNote('')
      setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Submission failed'),
  })

  // Barcode scanner — scan product to instantly fill the spot-check form
  const handleBarcodeScan = (barcode: string) => {
    const match = products.find(p => p.barcode === barcode)
    if (match) {
      setProductName(match.description)
      toast.success(`Found: ${match.description} — system qty: ${match.quantity}`, { duration: 3000 })
    } else {
      toast.error(`Barcode "${barcode}" not found in products`)
    }
  }

  useBarcode({ onScan: handleBarcodeScan })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-teal-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Inventory Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Inventory Checks</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Random spot checks to ensure physical stock matches digital records.</p>
        </div>
        <Button
          onClick={() => setSheetOpen(true)}
          className="h-12 bg-teal-600 hover:bg-teal-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-teal-600/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          NEW CHECK
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Checks Today', value: stats.todayCount, icon: ClipboardCheck, color: 'text-teal-600', sub: 'Completed today' },
          { label: 'Mismatches Today', value: stats.mismatchCount, icon: AlertTriangle, color: 'text-rose-600', sub: 'Discrepancies found' },
          { label: 'Total Checks', value: (checksQuery.data ?? []).length, icon: Box, color: 'text-indigo-600', sub: 'All-time records' },
          { label: 'Matches Today', value: stats.todayCount - stats.mismatchCount, icon: CheckCircle2, color: 'text-emerald-600', sub: 'Stock confirmed' },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary"><s.icon className="w-4 h-4 text-muted-foreground" /></div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 font-medium leading-none">
          Discrepancies are logged permanently and sent to the audit dashboard.
        </p>
      </div>

      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
            <CardHeader className="bg-secondary/30 pb-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight italic">Audit Log</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filteredChecks.length} results</CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, users..."
                  className="pl-9 h-10 shadow-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
            <Table className="aw-table">
              <TableHeader className="bg-secondary/20">
                <TableRow className="hover:bg-transparent border-b-2">
                  <TableHead className="pl-6 text-[10px] font-black uppercase">Product</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">System Qty</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Physical Count</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Difference</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Checked By</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Date / Time</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checksQuery.isLoading && <SkeletonRows cols={7} />}
                {!checksQuery.isLoading && filteredChecks.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No inventory checks found.</TableCell></TableRow>}
                {filteredChecks.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell className="max-w-[240px]">
                      <p className="font-bold text-sm tracking-tight truncate">{r.product_name}</p>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {r.system_qty}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm font-bold">
                      {r.counted_qty}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.difference === 0 ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase">Matches</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className={`font-mono font-bold ${r.difference < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {r.difference > 0 ? '+' : ''}{r.difference} {r.difference < 0 ? '⚠ Shortage' : '⚠ Surplus'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={r.checked_by} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs italic text-muted-foreground max-w-[150px] truncate">
                      {r.note || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </CardContent>
      </Card>

      {/* Inventory Check Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) { setProductName(''); setSystemQty(0); setCounted(''); setNote('') }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <div className="p-8 bg-teal-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">PHYSICAL STOCK COUNT</h2>
            <p className="text-teal-100 text-sm font-medium">Verify physical inventory against system records.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Search Product</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    list="inv-products"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    placeholder="Type product or scan barcode..."
                    className="h-12 pl-10 border-2 font-bold"
                  />
                  <datalist id="inv-products">{products.map(p => <option key={p.id} value={p.description} />)}</datalist>
                </div>
                <BarcodeCamera onScan={handleBarcodeScan} label="Scan" className="h-12" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">System Record</Label>
                <div className="h-12 flex items-center px-4 bg-secondary/30 border-2 rounded-xl font-mono text-xl font-black text-muted-foreground">
                  {systemQty}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-teal-600 ml-1">Physical Count *</Label>
                <Input
                  type="number"
                  value={counted}
                  onChange={e => setCounted(e.target.value)}
                  placeholder="Enter qty..."
                  className="h-12 border-2 font-mono text-xl font-black border-teal-300 focus:border-teal-500"
                />
              </div>
            </div>

            {productName && counted !== '' && (
              <div className={`p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${
                diff === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : diff !== null && diff < 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${diff === 0 ? 'bg-emerald-100' : diff !== null && diff < 0 ? 'bg-red-100' : 'bg-amber-100'}`}>
                    {diff === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight leading-none mb-0.5">
                      {diff === 0 ? 'Inventory Matches' : diff !== null && diff < 0 ? 'Stock Shortage' : 'Stock Surplus'}
                    </p>
                    <p className="text-[10px] font-bold opacity-70">
                      {diff === 0 ? 'System & physical are equal' : `Difference of ${diff} units`}
                    </p>
                  </div>
                </div>
                <div className="text-3xl font-mono font-black">
                  {diff !== null && diff > 0 ? '+' : ''}{diff}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Discrepancy Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Why is there a difference?" className="h-12 border-2 font-bold" />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Submission restricted to Supervisors & Admins
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            {isSup ? (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !productName || counted === ''}
                className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-teal-600/20"
              >
                {saveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />SUBMITTING...</> : 'CONFIRM AUDIT COUNT'}
              </Button>
            ) : (
              <Button disabled className="w-full h-14 rounded-2xl font-black text-lg opacity-50">SUPERVISOR ONLY</Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
