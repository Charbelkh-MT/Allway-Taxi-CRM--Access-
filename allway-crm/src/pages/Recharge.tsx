import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney, USD_RATE } from '@/lib/utils'
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
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { BrandLogo } from '@/components/shared/BrandLogos'
import { Spinner } from '@/components/shared/Spinner'
import {
  Package,
  ShoppingCart,
  History,
  TrendingUp,
  AlertCircle,
  Search,
  PlusCircle,
  ArrowUpRight,
  DollarSign,
  User,
} from 'lucide-react'

const BRANDS = ['Alfa', 'Touch']
const DENOMS = ['03.03', '04.50', '07.58', '15.15', '22.73', '77.28', 'Dollars', 'Month']
const QK = ['recharge_cards']

export default function Recharge() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin'

  const { data: clients = [] } = useClientsCache()

  const [activeTab, setActiveTab] = useState('inventory')
  const [stockSheetOpen, setStockSheetOpen] = useState(false)

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
    ;(supabase as any)
      .from('recharge_cards')
      .select('id', { count: 'exact', head: true })
      .eq('brand', rsBrand)
      .eq('denomination', rsDenom)
      .eq('status', 'in_stock')
      .then(({ count }: any) => setAvailable(count ?? 0))
  }, [rsBrand, rsDenom])

  const inventorySummary = useMemo(() => {
    const map: Record<string, { brand: string; denom: string; in_stock: number; sold: number; selling: number; cost: number }> = {}
    for (const r of cardQuery.data ?? []) {
      const key = `${r.brand}__${r.denomination}`
      if (!map[key]) map[key] = { brand: r.brand, denom: r.denomination, in_stock: 0, sold: 0, selling: r.selling ?? 0, cost: r.cost ?? 0 }
      if (r.status === 'in_stock') map[key].in_stock++
      if (r.status === 'sold') map[key].sold++
    }
    return Object.values(map)
  }, [cardQuery.data])

  const salesHistory = useMemo(() => {
    return (cardQuery.data ?? []).filter((r: any) => r.status === 'sold')
  }, [cardQuery.data])

  const stats = useMemo(() => {
    const totalInStock = inventorySummary.reduce((sum, item) => sum + item.in_stock, 0)
    const stockValue = inventorySummary.reduce((sum, item) => sum + item.in_stock * item.cost, 0)
    const today = new Date().toISOString().split('T')[0]
    const salesToday = salesHistory.filter((s: any) => s.sold_at?.startsWith(today)).length
    const profitToday = salesHistory
      .filter((s: any) => s.sold_at?.startsWith(today))
      .reduce((sum: number, s: any) => sum + (s.selling - s.cost), 0)
    return { totalInStock, stockValue, salesToday, profitToday }
  }, [inventorySummary, salesHistory])

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!isSup) throw new Error('Only admins can add card stock')
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
        station: profile?.station ?? '',
      }))
      const { error } = await (supabase as any).from('recharge_cards').insert(rows)
      if (error) throw error
      await log('stock_received', 'Recharge', `${qty}x ${rcBrand} ${rcDenom} — batch ${rcBatch}`)
    },
    onSuccess: () => {
      toast.success('Cards added to stock successfully')
      void queryClient.invalidateQueries({ queryKey: QK })
      setRcBatch('')
      setRcQty('1')
      setStockSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add stock'),
  })

  const sellMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(rsQty) || 1
      const { data: avail, error: fetchErr } = await (supabase as any)
        .from('recharge_cards')
        .select('id, cost, selling')
        .eq('brand', rsBrand)
        .eq('denomination', rsDenom)
        .eq('status', 'in_stock')
        .limit(qty)
      if (fetchErr) throw fetchErr
      if (!avail || avail.length < qty) throw new Error(`Not enough stock — have ${avail?.length ?? 0}, need ${qty}`)
      const clientName = rsClientId === 'cash' ? 'Cash' : clients.find((c) => String(c.id) === rsClientId)?.full_name ?? 'Unknown'
      const { error } = await (supabase as any)
        .from('recharge_cards')
        .update({
          status: 'sold',
          sold_by: profile?.name,
          sold_at: new Date().toISOString(),
          sold_to: clientName,
          station: profile?.station ?? '',
        })
        .in('id', avail.map((r: any) => r.id))
      if (error) throw error
      await log('card_sold', 'Recharge', `${qty}x ${rsBrand} ${rsDenom} sold to ${clientName}`)
      setAvailable((a) => Math.max(0, (a ?? qty) - qty))
    },
    onSuccess: () => {
      toast.success('Cards sold and recorded')
      void queryClient.invalidateQueries({ queryKey: QK })
      setRsClientId('cash')
      setRsQty('1')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to record sale'),
  })

  const filteredSummary = inventorySummary.filter(
    (item) =>
      item.brand.toLowerCase().includes(rsSearch.toLowerCase()) ||
      item.denom.toLowerCase().includes(rsSearch.toLowerCase()),
  )

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Recharge Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Card Inventory</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Manage Alfa & Touch inventory and track daily card sales.</p>
        </div>
        {isSup && (
          <Button
            onClick={() => setStockSheetOpen(true)}
            className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-emerald-600/20 group"
          >
            <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
            RECEIVE STOCK
          </Button>
        )}
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Total In Stock', value: stats.totalInStock, icon: Package, color: 'text-emerald-600', sub: 'Units Available' },
          { label: "Today's Sales", value: stats.salesToday, icon: TrendingUp, color: 'text-indigo-600', sub: 'Cards Sold Today' },
          { label: 'Stock Value', value: fmtMoney(stats.stockValue / USD_RATE), icon: DollarSign, color: 'text-amber-600', sub: `${(stats.stockValue / 1_000_000).toFixed(2)}M LBP at cost` },
          { label: "Today's Profit", value: fmtMoney(stats.profitToday / USD_RATE), icon: ArrowUpRight, color: stats.profitToday > 0 ? 'text-emerald-600' : 'text-rose-600', sub: `${stats.profitToday.toLocaleString()} LBP margin` },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary">
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Inventory / History Table */}
        <div className="lg:col-span-2">
          <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
            <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight italic">Card Stock</CardTitle>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Inventory Stream</p>
              </div>
              <div className="flex items-center gap-3">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="h-9 bg-background border-2 rounded-xl">
                    <TabsTrigger value="inventory" className="text-xs font-bold rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                      <Package className="w-3.5 h-3.5 mr-1.5" /> Inventory
                    </TabsTrigger>
                    <TabsTrigger value="sales" className="text-xs font-bold rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                      <History className="w-3.5 h-3.5 mr-1.5" /> History
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {activeTab === 'inventory' && (
                  <div className="relative w-44">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter..."
                      className="pl-9 h-9 border-2 rounded-xl text-xs font-bold"
                      value={rsSearch}
                      onChange={(e) => setRsSearch(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsContent value="inventory" className="mt-0">
                  <Table className="aw-table">
                    <TableHeader className="bg-secondary/20">
                      <TableRow className="hover:bg-transparent border-b-2">
                        <TableHead className="pl-6 text-[10px] font-black uppercase">Brand</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Denomination</TableHead>
                        <TableHead className="text-center text-[10px] font-black uppercase">In Stock</TableHead>
                        <TableHead className="text-center text-[10px] font-black uppercase">Sold</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase">Selling</TableHead>
                        <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cardQuery.isLoading && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 italic">Syncing inventory...</TableCell>
                        </TableRow>
                      )}
                      {!cardQuery.isLoading && filteredSummary.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">No matching inventory found.</TableCell>
                        </TableRow>
                      )}
                      {filteredSummary.map((r) => (
                        <TableRow key={`${r.brand}-${r.denom}`} className="hover:bg-secondary/10 transition-colors group">
                          <TableCell className="pl-6">
                            <BrandLogo brand={r.brand} size="sm" />
                          </TableCell>
                          <TableCell className="font-mono font-black text-sm text-indigo-600">{r.denom}</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-mono font-black text-sm ${r.in_stock > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {r.in_stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-mono text-muted-foreground">{r.sold}</TableCell>
                          <TableCell className="text-right font-mono font-black text-sm">
                            {fmtMoney(normalizeMoney(r.selling, 'LBP'), 'LBP')}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            {r.in_stock === 0 ? (
                              <Badge variant="destructive" className="animate-pulse text-[9px]">Out of Stock</Badge>
                            ) : r.in_stock < 10 ? (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-[9px]">Low Stock</Badge>
                            ) : (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[9px]">Healthy</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="sales" className="mt-0">
                  <Table className="aw-table">
                    <TableHeader className="bg-secondary/20">
                      <TableRow className="hover:bg-transparent border-b-2">
                        <TableHead className="pl-6 text-[10px] font-black uppercase">Date/Time</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Item</TableHead>
                        <TableHead className="text-[10px] font-black uppercase">Client</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase">Price</TableHead>
                        <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Seller</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No sales recorded yet.</TableCell>
                        </TableRow>
                      ) : (
                        salesHistory.slice(0, 100).map((s: any) => (
                          <TableRow key={s.id} className="hover:bg-secondary/10 transition-colors">
                            <TableCell className="pl-6 font-mono text-[10px] text-muted-foreground leading-tight">
                              {new Date(s.sold_at).toLocaleString('en-GB')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <BrandLogo brand={s.brand} size="sm" />
                                <span className="text-xs font-black font-mono text-indigo-600">{s.denomination}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-sm">{s.sold_to || 'Cash'}</TableCell>
                            <TableCell className="text-right font-mono font-black text-sm">
                              {fmtMoney(normalizeMoney(s.selling, 'LBP'), 'LBP')}
                            </TableCell>
                            <TableCell className="text-right pr-6 text-[10px] uppercase font-black text-muted-foreground">
                              {s.sold_by}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Quick Sale */}
        <div className="space-y-4">
          <Card className="rounded-3xl border-2 border-emerald-200 shadow-none overflow-hidden">
            <div className="p-6 bg-emerald-600 text-white">
              <h2 className="text-xl font-black uppercase tracking-tighter italic">QUICK SALE</h2>
              <p className="text-emerald-100 text-sm font-medium">Record a card sale instantly.</p>
            </div>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Network & Denomination</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={rsBrand} onValueChange={(v) => { setRsBrand(v); setAvailable(null) }}>
                    <SelectTrigger className="h-10 border-2 font-bold text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={rsDenom} onValueChange={(v) => { setRsDenom(v); setAvailable(null) }}>
                    <SelectTrigger className="h-10 border-2 font-bold text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DENOMS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Qty & Client</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={rsQty}
                    onChange={(e) => setRsQty(e.target.value)}
                    className="h-10 border-2 text-center font-mono font-bold"
                  />
                  <div className="col-span-2">
                    <Select value={rsClientId} onValueChange={setRsClientId}>
                      <SelectTrigger className="h-10 border-2 text-xs font-bold">
                        <SelectValue placeholder="Select Client..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Walk-in (Cash)</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-secondary/30 rounded-2xl border-2 border-dashed flex flex-col items-center space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Available Stock</p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-mono font-black ${available === 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {available ?? '…'}
                  </span>
                  <span className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter">Units</span>
                </div>
              </div>

              <Button
                onClick={() => sellMutation.mutate()}
                disabled={sellMutation.isPending || (available !== null && available < parseInt(rsQty))}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-2xl shadow-lg shadow-emerald-600/20"
              >
                {sellMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />RECORDING...</> : 'RECORD SALE'}
              </Button>
            </CardContent>
          </Card>

          <div className="p-5 rounded-3xl border-2 border-amber-200 bg-amber-50/50 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">Inventory Alert</p>
              <p className="text-[11px] leading-relaxed text-amber-800">
                All card movements are audited. Report any physical gaps immediately to admin.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Receive Stock Sheet */}
      <Sheet open={stockSheetOpen} onOpenChange={(open) => {
        setStockSheetOpen(open)
        if (!open) { setRcBrand(BRANDS[0]); setRcDenom(DENOMS[0]); setRcQty('1'); setRcBatch(''); setRcCost('0'); setRcSell('0') }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <div className="p-8 bg-emerald-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">RECEIVE STOCK</h2>
            <p className="text-emerald-100 text-sm font-medium">Add new card inventory to the system.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Brand</Label>
              <Select value={rcBrand} onValueChange={setRcBrand}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>{BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Denomination</Label>
              <Select value={rcDenom} onValueChange={setRcDenom}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>{DENOMS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Batch Number</Label>
              <Input value={rcBatch} onChange={(e) => setRcBatch(e.target.value)} placeholder="e.g. B-001" className="h-12 border-2 font-mono font-bold" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Qty</Label>
                <Input type="number" min="1" value={rcQty} onChange={(e) => setRcQty(e.target.value)} className="h-12 border-2 font-mono font-bold text-center" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cost (LBP)</Label>
                <Input type="number" value={rcCost} onChange={(e) => setRcCost(e.target.value)} className="h-12 border-2 font-mono font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sell (LBP)</Label>
                <Input type="number" value={rcSell} onChange={(e) => setRcSell(e.target.value)} className="h-12 border-2 font-mono font-bold text-emerald-600" />
              </div>
            </div>
            <div className="p-5 bg-secondary/30 rounded-2xl border-2 border-dashed text-center space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Margin Per Card</p>
              <p className="text-2xl font-mono font-black text-emerald-600">
                {((parseFloat(rcSell) || 0) - (parseFloat(rcCost) || 0)).toLocaleString()} LBP
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground italic text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Receipt will be logged as {profile?.name}
            </div>
          </div>
          <div className="p-8 bg-secondary/10 border-t">
            {isSup ? (
              <Button
                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-emerald-600/20"
                onClick={() => receiveMutation.mutate()}
                disabled={receiveMutation.isPending}
              >
                {receiveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'CONFIRM RECEIPT'}
              </Button>
            ) : (
              <Button disabled className="w-full h-14 rounded-2xl font-black text-lg opacity-50">
                SUPERVISOR ONLY
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
