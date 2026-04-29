import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useClientsCache } from '@/hooks/useClientsCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Package, ShoppingCart, History, TrendingUp, AlertCircle, Search, User, Filter } from 'lucide-react'

const BRANDS = ['Alfa', 'Touch']
const DENOMS = ['03.03', '04.50', '07.58', '15.15', '22.73', '77.28', 'Dollars', 'Month']
const QK = ['recharge_cards']

export default function Recharge() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin' || role === 'supervisor'
  
  const { data: clients = [] } = useClientsCache()

  const [activeTab, setActiveTab] = useState('inventory')
  
  // Stock Entry State
  const [rcBrand, setRcBrand] = useState(BRANDS[0])
  const [rcDenom, setRcDenom] = useState(DENOMS[0])
  const [rcQty, setRcQty] = useState('1')
  const [rcBatch, setRcBatch] = useState('')
  const [rcCost, setRcCost] = useState('0')
  const [rcSell, setRcSell] = useState('0')
  
  // Sale State
  const [rsBrand, setRsBrand] = useState(BRANDS[0])
  const [rsDenom, setRsDenom] = useState(DENOMS[0])
  const [rsQty, setRsQty] = useState('1')
  const [rsClientId, setRsClientId] = useState('cash')
  const [rsSearch, setRsSearch] = useState('')
  
  const [available, setAvailable] = useState<number | null>(null)

  const cardQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('recharge_cards').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) throw error
      return data ?? []
    },
  })

  useEffect(() => {
    (supabase as any).from('recharge_cards')
      .select('id', { count: 'exact', head: true })
      .eq('brand', rsBrand)
      .eq('denomination', rsDenom)
      .eq('status', 'in_stock')
      .then(({ count }: any) => setAvailable(count ?? 0))
  }, [rsBrand, rsDenom])

  const inventorySummary = useMemo(() => {
    const map: Record<string, { brand: string; denom: string; in_stock: number; sold: number; selling: number; cost: number }> = {}
    for (const r of (cardQuery.data ?? [])) {
      const key = `${r.brand}__${r.denomination}`
      if (!map[key]) map[key] = { brand: r.brand, denom: r.denomination, in_stock: 0, sold: 0, selling: r.selling ?? 0, cost: r.cost ?? 0 }
      if (r.status === 'in_stock') map[key].in_stock++
      if (r.status === 'sold') map[key].sold++
    }
    return Object.values(map)
  }, [cardQuery.data])

  const salesHistory = useMemo(() => {
    return (cardQuery.data ?? []).filter(r => r.status === 'sold')
  }, [cardQuery.data])

  const stats = useMemo(() => {
    const totalInStock = inventorySummary.reduce((sum, item) => sum + item.in_stock, 0)
    const stockValue = inventorySummary.reduce((sum, item) => sum + (item.in_stock * item.cost), 0)
    
    const today = new Date().toISOString().split('T')[0]
    const salesToday = salesHistory.filter(s => s.sold_at?.startsWith(today)).length
    const profitToday = salesHistory
      .filter(s => s.sold_at?.startsWith(today))
      .reduce((sum, s) => sum + (s.selling - s.cost), 0)

    return { totalInStock, stockValue, salesToday, profitToday }
  }, [inventorySummary, salesHistory])

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!isSup) throw new Error('Only supervisors can add card stock')
      const qty = parseInt(rcQty) || 1
      const rows = Array.from({ length: qty }, () => ({
        brand: rcBrand, 
        denomination: rcDenom, 
        batch_number: rcBatch.trim(),
        cost: parseFloat(rcCost) || 0, 
        selling: parseFloat(rcSell) || 0,
        currency: 'LBP', 
        status: 'in_stock', 
        received_by: profile?.name ?? 'system',
        station: profile?.station ?? ''
      }))
      const { error } = await (supabase as any).from('recharge_cards').insert(rows)
      if (error) throw error
      await log('stock_received', 'Recharge', `${qty}x ${rcBrand} ${rcDenom} — batch ${rcBatch}`)
    },
    onSuccess: () => {
      toast.success('Cards added to stock successfully')
      void queryClient.invalidateQueries({ queryKey: QK })
      setRcBatch(''); setRcQty('1')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add stock'),
  })

  const sellMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(rsQty) || 1
      const { data: avail, error: fetchErr } = await (supabase as any).from('recharge_cards')
        .select('id, cost, selling')
        .eq('brand', rsBrand)
        .eq('denomination', rsDenom)
        .eq('status', 'in_stock')
        .limit(qty)
      
      if (fetchErr) throw fetchErr
      if (!avail || avail.length < qty) throw new Error(`Not enough stock — have ${avail?.length ?? 0}, need ${qty}`)
      
      const clientName = rsClientId === 'cash' ? 'Cash' : clients.find(c => String(c.id) === rsClientId)?.full_name ?? 'Unknown'
      
      const { error } = await (supabase as any).from('recharge_cards')
        .update({ 
          status: 'sold', 
          sold_by: profile?.name, 
          sold_at: new Date().toISOString(),
          sold_to: clientName,
          station: profile?.station ?? ''
        })
        .in('id', avail.map((r: any) => r.id))
      
      if (error) throw error
      await log('card_sold', 'Recharge', `${qty}x ${rsBrand} ${rsDenom} sold to ${clientName}`)
      setAvailable(a => Math.max(0, (a ?? qty) - qty))
    },
    onSuccess: () => {
      toast.success('Cards sold and recorded')
      void queryClient.invalidateQueries({ queryKey: QK })
      setRsClientId('cash'); setRsQty('1')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to record sale'),
  })

  const filteredSummary = inventorySummary.filter(item => 
    item.brand.toLowerCase().includes(rsSearch.toLowerCase()) || 
    item.denom.toLowerCase().includes(rsSearch.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Recharge Cards</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage Alfa & Touch inventory and track daily sales.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-primary/5 border-primary/20">
            <div className="mr-3 p-2 bg-primary/10 rounded-full text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Today's Sales</p>
              <p className="text-lg font-bold font-mono leading-none text-primary">{stats.salesToday}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-green-500/5 border-green-500/20">
            <div className="mr-3 p-2 bg-green-500/10 rounded-full text-green-600">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Total In Stock</p>
              <p className="text-lg font-bold font-mono leading-none text-green-600">{stats.totalInStock}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Interface */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="grid grid-cols-3 w-[400px]">
                <TabsTrigger value="inventory" className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Inventory
                </TabsTrigger>
                <TabsTrigger value="sales" className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  History
                </TabsTrigger>
                <TabsTrigger value="stock-in" className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Receive
                </TabsTrigger>
              </TabsList>
              
              {activeTab === 'inventory' && (
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Filter brands/denoms..." 
                    className="pl-9 h-9 text-sm"
                    value={rsSearch}
                    onChange={(e) => setRsSearch(e.target.value)}
                  />
                </div>
              )}
            </div>

            <TabsContent value="inventory" className="mt-0">
              <Card className="overflow-hidden border-2">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Denomination</TableHead>
                      <TableHead className="text-center">In Stock</TableHead>
                      <TableHead className="text-center">Sold</TableHead>
                      <TableHead className="text-right">Selling Price</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cardQuery.isLoading && (
                      <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">Loading inventory data...</TableCell></TableRow>
                    )}
                    {!cardQuery.isLoading && filteredSummary.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground">No matching inventory found.</TableCell></TableRow>
                    )}
                    {filteredSummary.map(r => (
                      <TableRow key={`${r.brand}-${r.denom}`} className="hover:bg-secondary/5 transition-colors">
                        <TableCell>
                          <Badge variant="outline" className={r.brand === 'Alfa' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-purple-50 text-purple-700 border-purple-200'}>
                            {r.brand}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-primary">{r.denom}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-mono font-bold ${r.in_stock > 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {r.in_stock}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{r.sold}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {fmtMoney(normalizeMoney(r.selling, 'LBP'), 'LBP')}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.in_stock === 0 ? (
                            <Badge variant="destructive" className="animate-pulse">Out of Stock</Badge>
                          ) : r.in_stock < 10 ? (
                            <Badge className="bg-amber-500 hover:bg-amber-600">Low Stock</Badge>
                          ) : (
                            <Badge className="bg-green-600 hover:bg-green-700">Healthy</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="mt-0">
              <Card className="overflow-hidden border-2">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Seller</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesHistory.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No sales recorded yet.</TableCell></TableRow>
                    ) : (
                      salesHistory.slice(0, 100).map(s => (
                        <TableRow key={s.id} className="hover:bg-secondary/5 transition-colors">
                          <TableCell className="font-mono text-[10px] text-muted-foreground leading-tight">
                            {new Date(s.sold_at).toLocaleString('en-GB')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold">{s.brand}</span>
                              <span className="text-xs text-primary font-mono">{s.denomination}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{s.sold_to || 'Cash'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold">
                            {fmtMoney(normalizeMoney(s.selling, 'LBP'), 'LBP')}
                          </TableCell>
                          <TableCell className="text-right text-[10px] uppercase font-bold text-muted-foreground">
                            {s.sold_by}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="stock-in" className="mt-0">
              <Card className="border-2 border-primary/20">
                <CardHeader className="bg-primary/5 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    Receive New Stock
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Brand</Label>
                        <Select value={rcBrand} onValueChange={setRcBrand}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Denomination</Label>
                        <Select value={rcDenom} onValueChange={setRcDenom}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{DENOMS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Batch Number</Label>
                        <Input value={rcBatch} onChange={e => setRcBatch(e.target.value)} placeholder="e.g. B-001" className="font-mono" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Quantity to Add</Label>
                        <Input type="number" min="1" value={rcQty} onChange={e => setRcQty(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Cost Each (LBP)</Label>
                        <Input type="number" value={rcCost} onChange={e => setRcCost(e.target.value)} className="font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Selling Each (LBP)</Label>
                        <Input type="number" value={rcSell} onChange={e => setRcSell(e.target.value)} className="font-mono text-primary font-bold" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground italic text-xs">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Approval will be logged as {profile?.name}
                    </div>
                    {isSup ? (
                      <Button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending} className="w-48 bg-primary hover:bg-primary/90 font-bold">
                        {receiveMutation.isPending ? 'Processing...' : 'Confirm Receipt'}
                      </Button>
                    ) : (
                      <Button disabled className="w-48 opacity-50 cursor-not-allowed">Supervisor Only</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: Quick Sale */}
        <div className="space-y-6">
          <Card className="border-2 border-green-500/20 shadow-md">
            <CardHeader className="bg-green-500/5 pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                <ShoppingCart className="w-5 h-5" />
                Quick Sale
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Network & Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={rsBrand} onValueChange={v => { setRsBrand(v); setAvailable(null) }}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={rsDenom} onValueChange={v => { setRsDenom(v); setAvailable(null) }}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DENOMS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Sale Details</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <Input type="number" min="1" value={rsQty} onChange={e => setRsQty(e.target.value)} className="h-9 text-center" />
                    </div>
                    <div className="col-span-2">
                      <Select value={rsClientId} onValueChange={setRsClientId}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Client..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Walk-in (Cash)</SelectItem>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-secondary/30 rounded-lg border border-dashed flex flex-col items-center justify-center space-y-1">
                <p className="text-xs text-muted-foreground">Available Stock</p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-mono font-bold ${available === 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {available ?? '…'}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Units</span>
                </div>
              </div>

              <Button 
                onClick={() => sellMutation.mutate()} 
                disabled={sellMutation.isPending || (available !== null && available < parseInt(rsQty))}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-11 font-bold text-base shadow-lg"
              >
                {sellMutation.isPending ? 'Recording...' : 'Record Sale'}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-900">Inventory Alert</p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  All card movements are audited. Sales are deducted automatically. Report any physical gaps immediately to supervisors.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
