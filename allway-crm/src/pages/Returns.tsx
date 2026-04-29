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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { MethodBadge, UserBadge } from '@/components/shared/Badges'
import { RotateCcw, Plus, History, TrendingDown, DollarSign, Package, AlertCircle, Search, User } from 'lucide-react'

const QK = ['returns']

export default function Returns() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  const [activeTab, setActiveTab] = useState('history')
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
      
      const { error } = await (supabase as any).from('returns').insert({
        invoice_id: invId ? parseInt(invId) : null, 
        client_name: client.trim(),
        product_name: product.trim(), 
        quantity: parseInt(qty) || 1,
        refund_usd: parseFloat(refundUsd) || 0, 
        refund_method: refundMethod,
        reason: reason.trim(), 
        note: note.trim(),
        processed_by: profile?.name ?? 'system', 
        station: profile?.station ?? '',
      })
      
      if (error) throw error
      await log('return_processed', 'Returns', `Return — ${product.trim()} for ${client.trim()} — $${refundUsd}`)
    },
    onSuccess: () => {
      toast.success('Return processed and inventory adjusted')
      void queryClient.invalidateQueries({ queryKey: QK })
      setInvId(''); setClient(''); setProduct(''); setQty('1'); setRefundUsd('0'); setReason(''); setNote('')
      setActiveTab('history')
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('42P01')) toast.error('System Error: Returns table missing.')
      else toast.error(msg)
    },
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Returns & Refunds</h1>
          <p className="text-muted-foreground text-sm mt-1">Process customer returns and manage stock adjustments.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-primary/5 border-primary/20">
            <div className="mr-3 p-2 bg-primary/10 rounded-full text-primary">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Returns Today</p>
              <p className="text-lg font-bold font-mono leading-none text-primary">{stats.todayCount}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-destructive/5 border-destructive/20">
            <div className="mr-3 p-2 bg-destructive/10 rounded-full text-destructive">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Total Refunded</p>
              <p className="text-lg font-bold font-mono leading-none text-destructive">{fmtMoney(stats.totalRefunded)}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
        <p className="text-sm text-orange-800 font-medium leading-none">
          All returns are logged. Ensure the reason for return is accurately documented for quality control.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid grid-cols-2 w-[350px]">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Return History
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Return
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'history' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search clients, products..." 
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
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client & Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead className="text-center">Method</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-center">Processed By</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnsQuery.isLoading && <TableRow><TableCell colSpan={8} className="text-center py-20 text-muted-foreground italic">Loading history...</TableCell></TableRow>}
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
          </div>
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <Card className="border-2 border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-xl flex items-center gap-2 text-primary">
                <RotateCcw className="w-5 h-5" />
                Process Return / Refund
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Search className="w-3 h-3" /> Original Invoice #
                    </Label>
                    <Input 
                      type="number" 
                      value={invId} 
                      onChange={e => setInvId(e.target.value)} 
                      placeholder="e.g. 10452" 
                      className="h-11 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Client Name *
                    </Label>
                    <Input value={client} onChange={e => setClient(e.target.value)} placeholder="Who is returning?" className="h-11" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Package className="w-3 h-3" /> Product Returned *
                    </Label>
                    <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="What item?" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity</Label>
                    <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="h-11 font-mono" />
                  </div>
                </div>

                <div className="space-y-6 p-6 bg-secondary/20 rounded-xl border border-secondary">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Refund Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                      <Input type="number" step="0.01" value={refundUsd} onChange={e => setRefundUsd(e.target.value)} className="h-11 pl-8 font-mono text-lg font-bold text-destructive" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Refund Method</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash USD">Cash USD</SelectItem>
                        <SelectItem value="Whish">Whish Money</SelectItem>
                        <SelectItem value="Store credit">Store Credit</SelectItem>
                        <SelectItem value="Exchange only">Exchange Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reason for Return</Label>
                  <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Defective, Wrong Size..." className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal Note</Label>
                  <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Additional info for office..." className="h-11" />
                </div>
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-secondary/40 px-4 py-2 rounded-full">
                  <User className="w-4 h-4 text-primary" />
                  Processed by <span className="font-bold text-foreground">{profile?.name}</span>
                </div>
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending} 
                  className="w-full sm:w-64 h-12 bg-primary hover:bg-primary/90 text-lg font-bold shadow-lg shadow-primary/20"
                >
                  {saveMutation.isPending ? 'Processing...' : 'Complete Return'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
