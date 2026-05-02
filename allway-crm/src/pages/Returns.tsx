import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt, fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { MethodBadge, UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { RotateCcw, Plus, TrendingDown, DollarSign, Package, AlertCircle, Search, User, ArrowUpRight, PlusCircle } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'

const QK = ['returns']

export default function Returns() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [invId, setInvId] = useState('')
  const [client, setClient] = useState('')
  const [product, setProduct] = useState('')
  const [qty, setQty] = useState('1')
  const [refundUsd, setRefundUsd] = useState('0')
  const [refundMethod, setRefundMethod] = useState('Cash USD')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')

  const returnsQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('returns').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) {
        if (error.code === '42P01') return []
        throw error
      }
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = returnsQuery.data ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    const todayReturns = data.filter(r => r.created_at.startsWith(todayStr))
    const totalRefunded = todayReturns.reduce((sum, r) => sum + (parseFloat(r.refund_usd) || 0), 0)
    
    return {
      todayCount: todayReturns.length,
      totalRefunded
    }
  }, [returnsQuery.data])

  const filteredReturns = useMemo(() => {
    const data = returnsQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(r => 
      r.client_name.toLowerCase().includes(s) || 
      r.product_name.toLowerCase().includes(s) ||
      (r.invoice_id?.toString().includes(s))
    )
  }, [returnsQuery.data, search])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client.trim() || !product.trim()) throw new Error('Client and product names are required')
      if (parseInt(qty) <= 0) throw new Error('Return quantity must be at least 1')
      if (parseFloat(refundUsd) < 0) throw new Error('Refund amount cannot be negative')
      
      const returnQty = parseInt(qty) || 1

      // 1. Insert the return record
      const { error } = await (supabase as any).from('returns').insert({
        invoice_id: invId ? parseInt(invId) : null, 
        client_name: client.trim(),
        product_name: product.trim(), 
        quantity: returnQty,
        refund_usd: parseFloat(refundUsd) || 0, 
        refund_method: refundMethod,
        reason: reason.trim(), 
        note: note.trim(),
        processed_by: profile?.name ?? 'system', 
        station: profile?.station ?? '',
      })
      if (error) throw error

      // 2. Add quantity back to product stock (match by description, case-insensitive)
      const { data: matchedProducts } = await supabase
        .from('products')
        .select('id, quantity, description')
        .ilike('description', product.trim())
        .limit(1)

      if (matchedProducts && matchedProducts.length > 0) {
        const prod = matchedProducts[0] as any
        const newQty = (prod.quantity ?? 0) + returnQty
        await (supabase as any).from('products').update({ quantity: newQty }).eq('id', prod.id)
        await log('stock_adjusted', 'Returns', `Stock +${returnQty} for "${prod.description}" (return by ${client.trim()})`)
      }

      await log('return_processed', 'Returns', `Return — ${product.trim()} for ${client.trim()} — $${refundUsd}`)
    },
    onSuccess: () => {
      toast.success('Return processed and inventory adjusted')
      void queryClient.invalidateQueries({ queryKey: QK })
      setInvId(''); setClient(''); setProduct(''); setQty('1'); setRefundUsd('0'); setReason(''); setNote('')
      setSheetOpen(false)
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('42P01')) toast.error('System Error: Returns table missing.')
      else toast.error(msg)
    },
  })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Returns Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Returns & Refunds</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Process customer returns and manage stock adjustments.</p>
        </div>
        <Button
          onClick={() => setSheetOpen(true)}
          className="h-12 bg-rose-600 hover:bg-rose-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-rose-600/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          NEW RETURN
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Returns Today', value: stats.todayCount, icon: RotateCcw, color: 'text-rose-600', sub: 'Processed today' },
          { label: 'Refunded Today', value: fmtMoney(stats.totalRefunded), icon: DollarSign, color: 'text-amber-600', sub: 'Total refunded today' },
          { label: 'All-Time Returns', value: (returnsQuery.data ?? []).length, icon: Package, color: 'text-indigo-600', sub: 'Total records' },
          { label: 'All-Time Refunded', value: fmtMoney((returnsQuery.data ?? []).reduce((s: number, r: any) => s + (parseFloat(r.refund_usd) || 0), 0)), icon: TrendingDown, color: 'text-emerald-600', sub: 'Total refunded' },
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

      <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
        <p className="text-sm text-orange-800 font-medium leading-none">
          All returns are logged. Ensure the reason for return is accurately documented for quality control.
        </p>
      </div>

      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
            <CardHeader className="bg-secondary/30 pb-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight italic">Return History</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filteredReturns.length} results</CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients, products..."
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
                  <TableHead className="pl-6 text-[10px] font-black uppercase">Invoice</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Client & Item</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Qty</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Refund</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Method</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Reason</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Processed By</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnsQuery.isLoading && <SkeletonRows cols={8} />}
                {!returnsQuery.isLoading && filteredReturns.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-20 text-muted-foreground">No return records found.</TableCell></TableRow>}
                {filteredReturns.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell className="font-mono text-[10px] text-muted-foreground font-bold">
                      {r.invoice_id ? `#${r.invoice_id}` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-bold tracking-tight">{r.client_name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Package className="w-3 h-3" /> {r.product_name}
                      </p>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm font-bold">
                      {r.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-destructive">
                      {fmtMoney(r.refund_usd)}
                    </TableCell>
                    <TableCell className="text-center">
                      <MethodBadge method={r.refund_method} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] max-w-[120px] truncate block px-2 py-0.5 bg-secondary/20">
                        {r.reason || 'No reason'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={r.processed_by} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-muted-foreground italic">
                      {fmt(r.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </CardContent>
      </Card>

      {/* Return Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) { setInvId(''); setClient(''); setProduct(''); setQty('1'); setRefundUsd('0'); setReason(''); setNote('') }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <div className="p-8 bg-rose-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">PROCESS RETURN / REFUND</h2>
            <p className="text-rose-100 text-sm font-medium">Log customer returns and adjust inventory accordingly.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <Search className="w-3 h-3" /> Original Invoice # (optional)
              </Label>
              <Input type="number" value={invId} onChange={e => setInvId(e.target.value)} placeholder="e.g. 10452" className="h-12 border-2 font-mono font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <User className="w-3 h-3" /> Client Name *
              </Label>
              <Input value={client} onChange={e => setClient(e.target.value)} placeholder="Who is returning?" className="h-12 border-2 font-bold" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Product Returned *
                </Label>
                <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="Item name..." className="h-12 border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Qty</Label>
                <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="h-12 border-2 font-mono font-bold text-center" />
              </div>
            </div>
            <div className="p-5 bg-rose-50 rounded-2xl border-2 border-rose-200 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-rose-700">Refund Details</p>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Refund Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-rose-800/50 font-mono font-black">$</span>
                  <Input type="number" step="0.01" value={refundUsd} onChange={e => setRefundUsd(e.target.value)} className="h-12 pl-8 border-2 font-mono text-lg font-black border-rose-300 text-destructive" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Refund Method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="h-12 border-2 font-bold border-rose-300"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash USD">Cash USD</SelectItem>
                    <SelectItem value="Whish">Whish Money</SelectItem>
                    <SelectItem value="Store credit">Store Credit</SelectItem>
                    <SelectItem value="Exchange only">Exchange Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Reason for Return</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Defective, Wrong Size..." className="h-12 border-2 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Internal Note</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Additional info for office..." className="h-12 border-2 font-bold" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
              <User className="w-3.5 h-3.5 shrink-0" />
              Processed by {profile?.name}
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-rose-600/20"
            >
              {saveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'COMPLETE RETURN'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
