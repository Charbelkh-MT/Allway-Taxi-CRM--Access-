import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { useBarcode } from '@/hooks/useBarcode'
import { lookupBarcode } from '@/lib/barcodeUtils'
import { useRole } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Package, Plus, Search, AlertTriangle, BarChart3, ArrowUpRight, Layers, Box, Hash, Tag, LayoutGrid, FileText, ScanBarcode } from 'lucide-react'
import type { Product } from '@/types/database'
import { ScanToAssign } from '@/components/shared/ScanToAssign'

const QK = ['products']
const CATEGORIES = ['Accessories', 'Mobiles', 'Recharges', 'Cables', 'Toys', 'Other']

export default function Products() {
  const queryClient = useQueryClient()
  const { log } = useAuditLog()
  const role = useRole()
  const canAdd = role === 'admin' || role === 'supervisor'

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [scanMode, setScanMode] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('')
  const [brand, setBrand] = useState('')
  const [barcode, setBarcode] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'LBP'>('USD')
  const [cost, setCost] = useState('0')
  const [selling, setSelling] = useState('0')
  const [qty, setQty] = useState('0')

  const productsQuery = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Product[]> => {
      let allData: Product[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('products').select('*').eq('active', true).order('description', { ascending: true }).range(from, from + 999)
        if (error) throw error
        if (!data || data.length === 0) break
        allData = [...allData, ...data]
        if (data.length < 1000) break
        from += 1000
      }
      return allData
    },
  })

  const { categories, brands, stats } = useMemo(() => {
    const data = productsQuery.data ?? []
    const cats = new Set(data.map(p => p.category).filter(Boolean))
    const brs = new Set(data.map(p => p.brand).filter(Boolean))
    return {
      categories: [...cats].sort(),
      brands: [...brs].sort(),
      stats: {
        totalItems: data.length,
        totalQty: data.reduce((a, p) => a + (p.quantity || 0), 0),
        totalValueUsd: data.reduce((a, p) => {
          const n = normalizeMoney(p.cost, p.currency)
          return a + (p.quantity || 0) * (p.currency === 'LBP' ? n / 90000 : n)
        }, 0),
        lowStock: data.filter(p => (p.quantity || 0) > 0 && (p.quantity || 0) <= 5).length,
        outOfStock: data.filter(p => (p.quantity || 0) <= 0).length,
      }
    }
  }, [productsQuery.data])

  const filtered = useMemo(() => {
    let rows = productsQuery.data ?? []
    if (catFilter !== 'all') rows = rows.filter(p => p.category === catFilter)
    if (brandFilter !== 'all') rows = rows.filter(p => p.brand === brandFilter)
    if (stockFilter === 'low') rows = rows.filter(p => (p.quantity || 0) > 0 && (p.quantity || 0) <= 5)
    else if (stockFilter === 'out') rows = rows.filter(p => (p.quantity || 0) <= 0)
    else if (stockFilter === 'in') rows = rows.filter(p => (p.quantity || 0) > 0)
    else if (stockFilter === 'suspicious') rows = rows.filter(p => normalizeMoney(p.cost, p.currency) > normalizeMoney(p.selling, p.currency))
    const term = search.trim().toLowerCase()
    if (term) rows = rows.filter(p => p.description.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term) || p.id.toString().includes(term))
    return rows
  }, [productsQuery.data, search, catFilter, brandFilter, stockFilter])

  function handleOpenAdd() {
    setEditingProduct(null); setDesc(''); setCat(''); setBrand(''); setBarcode(''); setCurrency('USD'); setCost('0'); setSelling('0'); setQty('0'); setDialogOpen(true)
  }
  function handleOpenEdit(p: Product) {
    setEditingProduct(p); setDesc(p.description); setCat(p.category || ''); setBrand(p.brand || ''); setBarcode(p.barcode || '')
    setCurrency(p.currency); setCost(String(normalizeMoney(p.cost, p.currency))); setSelling(String(normalizeMoney(p.selling, p.currency))); setQty(String(p.quantity || 0)); setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!desc.trim()) throw new Error('Description required')
      const costVal = parseFloat(cost) || 0
      const sellVal = parseFloat(selling) || 0
      if (costVal > 0 && sellVal > 0 && costVal > sellVal) {
        const ok = window.confirm(`⚠ Cost (${costVal}) exceeds selling price (${sellVal}). This item will sell at a loss. Save anyway?`)
        if (!ok) throw new Error('Cancelled — adjust the price before saving')
      }
      const payload = { description: desc.trim(), category: cat.trim(), brand: brand.trim(), barcode: barcode.trim(), currency, cost: parseFloat(cost) || 0, selling: parseFloat(selling) || 0, quantity: parseInt(qty) || 0 }
      if (editingProduct) {
        const { error } = await (supabase as any).from('products').update(payload).eq('id', editingProduct.id)
        if (error) throw error
        await log('product_edited', 'Products', `Updated: ${desc.trim()}`)
      } else {
        const { error } = await (supabase as any).from('products').insert(payload)
        if (error) throw error
        await log('product_added', 'Products', `New: ${desc.trim()}`)
      }
    },
    onSuccess: () => { toast.success(editingProduct ? 'Product updated' : 'Product added'); void queryClient.invalidateQueries({ queryKey: QK }); setDialogOpen(false) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  // Barcode scan on Products page:
  // — If product found → open edit dialog pre-filled
  // — If not found → open add dialog with barcode pre-filled
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false)

  const handleBarcodeScan = async (barcode: string) => {
    const result = await lookupBarcode(barcode)
    if (result.found) {
      handleOpenEdit(result.product as any)
      toast.success(`Found: ${result.product.description}`)
    } else {
      // Pre-fill barcode field for new product
      setBarcode(barcode)
      handleOpenAdd()
      toast.info(`New barcode "${barcode}" — fill in product details`)
    }
  }

  useBarcode({ onScan: handleBarcodeScan })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Inventory Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Product Catalog</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Manage inventory, categories, pricing, and stock levels.</p>
        </div>
        {canAdd && (
          <Button onClick={handleOpenAdd} className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-emerald-600/20">
            <Plus className="w-4 h-4 mr-2" /> ADD PRODUCT
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Stock Value', value: fmtMoney(stats.totalValueUsd), icon: BarChart3, color: 'text-emerald-600', sub: `${stats.totalQty} total units` },
          { label: 'Total Items', value: stats.totalItems, icon: Layers, color: 'text-indigo-600', sub: 'Unique SKUs' },
          { label: 'Low Stock', value: stats.lowStock, icon: AlertTriangle, color: 'text-amber-600', sub: '5 units or fewer' },
          { label: 'Out of Stock', value: stats.outOfStock, icon: Box, color: 'text-rose-600', sub: 'Needs restocking' },
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
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Product Registry</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filtered.length} results</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-10 h-10 border-2 rounded-xl text-xs font-bold" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-36 h-10 border-2 rounded-xl font-bold text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-36 h-10 border-2 rounded-xl font-bold text-xs"><SelectValue placeholder="Stock" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
                <SelectItem value="suspicious">Negative Margin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 w-20 text-[10px] font-black uppercase">ID</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Product</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Category</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Cost</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Price</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Stock</TableHead>
                {canAdd && <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-20 italic">Loading catalog...</TableCell></TableRow>}
              {filtered.map(p => {
                const suspicious = normalizeMoney(p.cost, p.currency) > normalizeMoney(p.selling, p.currency)
                const qty = p.quantity ?? 0
                return (
                  <TableRow key={p.id} className="hover:bg-secondary/10 transition-colors group">
                    <TableCell className="pl-6 font-mono text-[10px] font-black text-muted-foreground">#{p.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-black text-sm uppercase tracking-tight truncate max-w-[300px]">{p.description}</span>
                        <span className="text-[9px] font-mono text-muted-foreground opacity-60 flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{p.barcode || 'No barcode'}</span>
                        {suspicious && <Badge variant="destructive" className="w-fit h-4 text-[8px] px-1 uppercase">Neg. Margin</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="secondary" className="w-fit h-5 text-[9px] uppercase bg-emerald-50 text-emerald-700 border-emerald-200">{p.category || 'Other'}</Badge>
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">{p.brand || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground italic opacity-60">
                      {fmtMoney(normalizeMoney(p.cost, p.currency), p.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-black text-indigo-600">
                      {fmtMoney(normalizeMoney(p.selling, p.currency), p.currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      {qty <= 0 ? (
                        <Badge variant="destructive" className="font-mono font-black h-5 px-2 text-[9px]">OUT</Badge>
                      ) : qty <= 5 ? (
                        <Badge variant="outline" className="font-mono font-black h-5 px-2 text-[9px] bg-amber-50 text-amber-700 border-amber-200">{qty} LOW</Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono font-black h-5 px-2 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">{qty}</Badge>
                      )}
                    </TableCell>
                    {canAdd && (
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="sm" className="h-8 px-4 opacity-0 group-hover:opacity-100 font-black text-[9px] uppercase" onClick={() => handleOpenEdit(p)}>EDIT</Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canAdd && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-3xl border-2">
            <div className="p-8 bg-emerald-600 text-white">
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">{editingProduct ? 'UPDATE PRODUCT' : 'NEW PRODUCT'}</h2>
              <p className="text-emerald-100 text-sm">Maintain accurate catalog and pricing data.</p>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description *</Label>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Product name..." className="h-12 border-2 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Category</Label>
                  <Input list="prod-cats" value={cat} onChange={e => setCat(e.target.value)} placeholder="Category..." className="h-12 border-2 font-bold" />
                  <datalist id="prod-cats">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Brand</Label>
                  <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand..." className="h-12 border-2 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Barcode</Label>
                  <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Scan..." className="h-12 border-2 font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Qty in Stock</Label>
                  <Input type="number" value={qty} onChange={e => setQty(e.target.value)} className="h-12 border-2 font-mono font-bold" />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between px-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={v => setCurrency(v as 'USD' | 'LBP')}>
                  <SelectTrigger className="h-9 w-24 border-2 font-black text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="LBP">LBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Unit Cost</Label>
                  <Input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="h-12 border-2 font-mono font-black text-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Selling Price</Label>
                  <Input type="number" step="0.01" value={selling} onChange={e => setSelling(e.target.value)} className="h-12 border-2 font-mono font-black text-lg" />
                </div>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg rounded-2xl">
                {saveMutation.isPending ? 'SAVING...' : editingProduct ? 'UPDATE PRODUCT' : 'ADD TO CATALOG'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
