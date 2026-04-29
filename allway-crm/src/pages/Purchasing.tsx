import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt, fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useProductsCache } from '@/hooks/useProductsCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
  FileText
} from 'lucide-react'
import { UserBadge } from '@/components/shared/Badges'
import type { Supplier } from '@/types/database'

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

  const [activeTab, setActiveTab] = useState('history')
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
    const data = purchasesQuery.data ?? []
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
    const data = purchasesQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(p => 
      p.supplier_name.toLowerCase().includes(s) || 
      p.id.toString().includes(s)
    )
  }, [purchasesQuery.data, search])

  const totalUsd = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitCost, 0), [lines])

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
      setActiveTab('history')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to register purchase'),
  })

  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive opacity-50" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Access Restricted</h1>
        <p className="text-muted-foreground">Only supervisors and admins can manage purchase orders.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Purchasing & Procurement</h1>
          <p className="text-muted-foreground text-sm mt-1">Issue purchase orders and manage incoming inventory shipments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-indigo-500/5 border-indigo-500/20">
            <div className="mr-3 p-2 bg-indigo-500/10 rounded-full text-indigo-600">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Total Procurement</p>
              <p className="text-lg font-bold font-mono leading-none text-indigo-600">{fmtMoney(stats.totalPurchased)}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-destructive/5 border-destructive/20">
            <div className="mr-3 p-2 bg-destructive/10 rounded-full text-destructive">
              <TrendingUp className="w-4 h-4 rotate-180" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Unpaid Debt</p>
              <p className="text-lg font-bold font-mono leading-none text-destructive">{fmtMoney(stats.totalDebt)}</p>
            </div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid grid-cols-2 w-[350px]">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              PO History
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              New Order
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'history' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search PO # or supplier..." 
                className="pl-9 h-10 shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <TabsContent value="history" className="mt-0 space-y-4">
          <div className="rounded-xl border-2 shadow-sm overflow-hidden bg-background">
            <Table>
              <TableHeader className="bg-secondary/40">
                <TableRow>
                  <TableHead className="w-[100px]">Order #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-center">Debt Status</TableHead>
                  <TableHead className="text-center">Issued By</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">Syncing procurement logs...</TableCell></TableRow>}
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
          </div>
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <Card className="border-2 border-indigo-500/20 shadow-md">
            <CardHeader className="bg-indigo-500/5 pb-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2 text-indigo-700">
                    <FileText className="w-5 h-5" />
                    Create Purchase Order
                  </CardTitle>
                  <CardDescription>Register incoming stock and update inventory costs.</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">PO Date</p>
                  <p className="font-mono font-bold">{new Date().toLocaleDateString('en-GB')}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Supplier *
                  </Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="h-11 shadow-sm font-medium"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                    <SelectContent>
                      {(suppliersQuery.data ?? []).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-indigo-700">Logged By</p>
                    <p className="font-bold text-sm">{profile?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-indigo-700">Station</p>
                    <p className="font-bold text-sm uppercase">{profile?.station || 'Admin'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    Order Line Items
                  </h3>
                  <Button variant="outline" size="sm" onClick={addLine} className="h-8 gap-1.5 border-dashed hover:border-primary hover:bg-primary/5">
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {lines.map((line, i) => (
                    <div key={i} className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex-1">
                        <Input 
                          list="po-products" 
                          placeholder="Search product..." 
                          value={line.description} 
                          onChange={e => updateLine(i, { description: e.target.value })} 
                          className="h-10"
                        />
                      </div>
                      <div className="w-24">
                        <Input 
                          type="number" 
                          min={1} 
                          placeholder="Qty"
                          value={line.qty} 
                          onChange={e => updateLine(i, { qty: parseInt(e.target.value) || 1 })} 
                          className="h-10 font-mono text-center"
                        />
                      </div>
                      <div className="w-32 relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground font-mono text-xs">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="Cost"
                          value={line.unitCost} 
                          onChange={e => updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })} 
                          className="h-10 pl-7 font-mono"
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <datalist id="po-products">{products.map(p => <option key={p.id} value={p.description} />)}</datalist>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Amount Paid Today (USD)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-green-600 font-mono font-bold">$</span>
                      <Input 
                        type="number" 
                        step="0.01" 
                        value={paidUsd} 
                        onChange={e => setPaidUsd(e.target.value)} 
                        className="h-11 pl-8 font-mono text-lg font-bold text-green-600 bg-green-50/30 border-green-200 focus:border-green-500" 
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-secondary/20 rounded-xl border flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Any unpaid balance will be automatically added to the supplier's outstanding ledger.
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20 flex flex-col justify-center items-center">
                  <p className="text-[10px] uppercase font-bold opacity-70 tracking-widest mb-1">Grand Total (USD)</p>
                  <p className="text-4xl font-mono font-bold">{fmtMoney(totalUsd)}</p>
                  <div className="mt-4 flex items-center gap-2 text-[10px] bg-white/10 px-3 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Inventory stock will increase upon save
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-end gap-4">
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending || !supplierId || totalUsd <= 0} 
                  className="w-full sm:w-64 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-lg shadow-indigo-600/20"
                >
                  {saveMutation.isPending ? 'Processing Order...' : 'Register Purchase'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
