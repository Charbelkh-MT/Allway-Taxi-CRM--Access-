import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt, fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useProductsCache } from '@/hooks/useProductsCache'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { useBarcode } from '@/hooks/useBarcode'
import { lookupBarcode } from '@/lib/barcodeUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import {
  ShoppingCart,
  Plus,
  History,
  TrendingUp,
  Building2,
  Package,
  User,
  DollarSign,
  Trash2,
  PlusCircle,
  AlertCircle,
  Search,
  CheckCircle2,
  FileText,
  ArrowUpRight
} from 'lucide-react'
import { UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import type { Supplier } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'

interface PoLine { description: string; qty: number; unitCost: number }
const QK = ['purchases']
const SUPQ = ['suppliers']

export default function Purchasing() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const canCreate = role === 'admin' || role === 'supervisor'
  const { data: products = [] } = useProductsCache()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [paidUsd, setPaidUsd] = useState('0')
  const [lines, setLines] = useState<PoLine[]>([{ description: '', qty: 1, unitCost: 0 }])
  const [search, setSearch] = useState('')

  const purchasesQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  const suppliersQuery = useQuery({
    queryKey: SUPQ,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = (purchasesQuery.data ?? []) as any[]
    const totalPurchased = data.reduce((sum, p) => sum + (p.total_usd || 0), 0)
    const totalPaid = data.reduce((sum, p) => sum + (p.paid_usd || 0), 0)
    const totalDebt = totalPurchased - totalPaid
    
    return {
      count: data.length,
      totalPurchased,
      totalDebt
    }
  }, [purchasesQuery.data])

  const filteredPurchases = useMemo(() => {
    const data = (purchasesQuery.data ?? []) as any[]
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(p => 
      p.supplier_name.toLowerCase().includes(s) || 
      p.id.toString().includes(s)
    )
  }, [purchasesQuery.data, search])

  const totalUsd = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitCost, 0), [lines])

  // Barcode scan on Purchasing page: scan product to add to purchase order
  const handleBarcodeScan = async (barcode: string) => {
    if (!canCreate) return
    const result = await lookupBarcode(barcode)
    if (result.found) {
      const p = result.product
      // Check if already in lines, if so increment qty
      const existing = lines.findIndex(l => l.description === p.description)
      if (existing >= 0) {
        setLines(prev => prev.map((l, i) => i === existing ? { ...l, qty: l.qty + 1 } : l))
        toast.success(`+1 qty: ${p.description}`, { duration: 2000 })
      } else {
        setLines(prev => [...prev, { description: p.description, qty: 1, unitCost: p.cost }])
        toast.success(`Added to PO: ${p.description}`, { duration: 2000 })
      }
    } else {
      toast.error(`Barcode "${barcode}" not found`)
    }
  }

  useBarcode({ onScan: handleBarcodeScan, active: canCreate })

  function updateLine(i: number, patch: Partial<PoLine>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function addLine() {
    setLines(prev => [...prev, { description: '', qty: 1, unitCost: 0 }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error('Please select a supplier')
      const supplier = suppliersQuery.data?.find(s => String(s.id) === supplierId)
      const validLines = lines.filter(l => l.description.trim())
      if (!validLines.length) throw new Error('Add at least one product line')

      // 1. Create the purchase record
      const { data: po, error } = await (supabase as any).from('purchases').insert({
        supplier_id: parseInt(supplierId), 
        supplier_name: supplier?.name ?? 'Unknown',
        total_usd: totalUsd, 
        paid_usd: parseFloat(paidUsd) || 0,
        items: validLines, 
        created_by: profile?.name ?? 'system', 
        station: profile?.station ?? '',
      }).select().single()
      
      if (error) throw error

      // 2. Update product stock for each line
      for (const line of validLines) {
        const product = products.find(p => p.description.toLowerCase() === line.description.trim().toLowerCase())
        if (product) {
          const newQty = (product.quantity || 0) + line.qty
          await (supabase as any).from('products').update({ 
            quantity: newQty,
            cost: line.unitCost > 0 ? line.unitCost : product.cost
          }).eq('id', product.id)
        }
      }

      await log('purchase_created', 'Purchasing', `PO #${po.id} — ${supplier?.name} — $${totalUsd.toFixed(2)}`)
    },
    onSuccess: () => {
      toast.success('Purchase order registered and inventory updated')
      void queryClient.invalidateQueries({ queryKey: QK })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      setSupplierId(''); setPaidUsd('0')
      setLines([{ description: '', qty: 1, unitCost: 0 }])
      setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to register purchase'),
  })

  if (!canCreate) {
    return (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Procurement Module</span>
            </div>
            <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Purchase Orders</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Issue purchase orders and manage incoming inventory shipments.</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive opacity-50" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Access Restricted</h1>
          <p className="text-muted-foreground">Only supervisors and admins can manage purchase orders.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Procurement Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Purchase Orders</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Issue purchase orders and manage incoming inventory shipments.</p>
        </div>
        <Button
          onClick={() => setSheetOpen(true)}
          className="h-12 bg-orange-600 hover:bg-orange-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-orange-600/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          NEW ORDER
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Total Procurement', value: fmtMoney(stats.totalPurchased), icon: ShoppingCart, color: 'text-emerald-600', sub: 'All-time purchases' },
          { label: 'Outstanding Debt', value: fmtMoney(stats.totalDebt), icon: TrendingUp, color: 'text-rose-600', sub: 'Unpaid balance' },
          { label: 'PO Count', value: stats.count, icon: FileText, color: 'text-indigo-600', sub: 'Total orders' },
          { label: 'Amount Paid', value: fmtMoney(stats.totalPurchased - stats.totalDebt), icon: DollarSign, color: 'text-amber-600', sub: 'Settled payments' },
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

      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
            <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight italic">PO History</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filteredPurchases.length} results</CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search PO # or supplier..."
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
                  <TableHead className="pl-6 text-[10px] font-black uppercase w-[100px]">Order #</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Supplier</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Total USD</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Paid</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Debt Status</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Issued By</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesQuery.isLoading && <SkeletonRows cols={7} />}
                {!purchasesQuery.isLoading && filteredPurchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No purchase orders found.</TableCell></TableRow>}
                {filteredPurchases.map((r: any) => {
                  const total = normalizeMoney(r.total_usd, 'USD')
                  const paid = normalizeMoney(r.paid_usd, 'USD')
                  const remaining = total - paid
                  return (
                    <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                      <TableCell className="font-mono text-xs font-bold text-muted-foreground">
                        #{r.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span className="font-bold text-sm tracking-tight">{r.supplier_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold">
                        {fmtMoney(total)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-green-600">
                        {fmtMoney(paid)}
                      </TableCell>
                      <TableCell className="text-center">
                        {remaining > 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-mono text-[10px]">
                            {fmtMoney(remaining)} DUE
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono text-[10px]">
                            PAID ✓
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <UserBadge name={r.created_by} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-muted-foreground italic">
                        {fmt(r.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </CardContent>
      </Card>

      {/* Purchase Order Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) { setSupplierId(''); setPaidUsd('0'); setLines([{ description: '', qty: 1, unitCost: 0 }]) }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          <div className="p-8 bg-orange-600 text-white flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">CREATE PURCHASE ORDER</h2>
              <p className="text-orange-100 text-sm font-medium">Register incoming stock and update inventory costs.</p>
            </div>
            <div className="text-right text-orange-100">
              <p className="text-[9px] uppercase font-black">PO Date</p>
              <p className="font-mono font-black text-sm">{new Date().toLocaleDateString('en-GB')}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Supplier *
              </Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>{(suppliersQuery.data ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Line Items
                </Label>
                <div className="flex items-center gap-2">
                  <BarcodeCamera onScan={handleBarcodeScan} label="Scan" hint="" className="h-8 text-[9px]" />
                  <Button variant="ghost" size="sm" onClick={addLine} className="h-8 text-[9px] font-black uppercase text-orange-600 hover:bg-orange-50">Add Line +</Button>
                </div>
              </div>
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <Input list="po-products" placeholder="Product..." value={line.description} onChange={e => updateLine(i, { description: e.target.value })} className="h-10 border-2 text-sm font-bold flex-1" />
                    <Input type="number" min={1} value={line.qty} onChange={e => updateLine(i, { qty: parseInt(e.target.value) || 1 })} className="w-16 h-10 border-2 font-mono text-center font-bold" />
                    <div className="relative w-24">
                      <span className="absolute left-2 top-2.5 text-[10px] font-black text-muted-foreground">$</span>
                      <Input type="number" step="0.01" value={line.unitCost} onChange={e => updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })} className="h-10 pl-5 border-2 font-mono text-right font-bold" />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="h-10 w-10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <datalist id="po-products">{products.map(p => <option key={p.id} value={p.description} />)}</datalist>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Amount Paid Today (USD)
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-emerald-600 font-mono font-black">$</span>
                <Input type="number" step="0.01" value={paidUsd} onChange={e => setPaidUsd(e.target.value)} className="h-12 pl-8 border-2 font-mono text-lg font-black text-emerald-600 border-emerald-200 focus:border-emerald-500" />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium ml-1">Unpaid balance is added to the supplier's outstanding ledger.</p>
            </div>

            <div className="p-6 bg-secondary/30 rounded-2xl border-2 border-dashed text-center space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Grand Total</p>
              <p className="text-4xl font-mono font-black text-orange-600">{fmtMoney(totalUsd)}</p>
              <p className="text-[9px] font-bold text-muted-foreground opacity-60 flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> Inventory increases upon save</p>
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !supplierId || totalUsd <= 0}
              className="w-full h-14 bg-orange-600 hover:bg-orange-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-orange-600/20"
            >
              {saveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'REGISTER PURCHASE'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
