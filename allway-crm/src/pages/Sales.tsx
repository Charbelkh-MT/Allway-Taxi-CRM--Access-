import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtDateTime, fmtMoney, normalizeMoney, USD_RATE, LBP_MIN } from '@/lib/utils'
import { useAuth, useCan, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useClientsCache } from '@/hooks/useClientsCache'
import { useProductsCache } from '@/hooks/useProductsCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter, 
  TrendingUp, 
  Calendar, 
  Clock, 
  User, 
  Wallet, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  ArrowUpRight, 
  FileText,
  ShoppingBag,
  Trash2,
  Package,
  PlusCircle,
  Building2,
  DollarSign,
  Printer,
  Eye,
  LayoutGrid,
  ChevronRight
} from 'lucide-react'
import { MethodBadge, StatusBadge, UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { useBarcode } from '@/hooks/useBarcode'
import { lookupBarcode } from '@/lib/barcodeUtils'
import type { Invoice, InvoiceItem } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'

type RangeFilter = 'today' | 'week' | 'month'
type PaymentMethod = 'Cash USD' | 'Cash LBP' | 'Whish' | 'Card' | 'Debt'

interface InvoiceLineDraft {
  productName: string
  productId: number | null
  qty: number
  unitPrice: number
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash USD', 'Cash LBP', 'Whish', 'Card', 'Debt']
const INVOICES_QUERY_KEY = ['sales', 'invoices']

function startOfRange(range: RangeFilter) {
  const now = new Date()
  const date = new Date(now)
  if (range === 'today') { date.setHours(0, 0, 0, 0); return date }
  if (range === 'week') { date.setDate(now.getDate() - 6); date.setHours(0, 0, 0, 0); return date }
  date.setDate(1); date.setHours(0, 0, 0, 0); return date
}

function getInvoiceLbp(invoice: Invoice | null): number {
  if (!invoice) return 0
  const lbp = normalizeMoney(invoice.total_lbp, 'LBP')
  if (lbp >= LBP_MIN) return lbp
  return normalizeMoney(invoice.total_usd, 'USD') * USD_RATE
}

function getInvoiceUsd(invoice: Invoice | null): number {
  if (!invoice) return 0
  const usd = normalizeMoney(invoice.total_usd, 'USD')
  const lbp = normalizeMoney(invoice.total_lbp, 'LBP')
  if (usd > 0) return usd
  return lbp / USD_RATE
}

export default function Sales() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const canUseSales = useCan('sales')
  const canApproveVoid = role === 'admin'

  const [search, setSearch] = useState('')
  const [range, setRange] = useState<RangeFilter>('today')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const [clientName, setClientName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash USD')
  const [lines, setLines] = useState<InvoiceLineDraft[]>([
    { productName: '', productId: null, qty: 1, unitPrice: 0 },
  ])

  const invoicesQuery = useQuery({
    queryKey: [...INVOICES_QUERY_KEY, range] as const,
    queryFn: async (): Promise<Invoice[]> => {
      const from = startOfRange(range).toISOString()
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .gte('created_at', from)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: clients = [] } = useClientsCache()
  const { data: products = [] } = useProductsCache()

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = invoicesQuery.data ?? []
    if (term === 'suspicious') return rows.filter(inv => getInvoiceUsd(inv) > 5000 || inv.status === 'void_requested')
    if (!term) return rows
    return rows.filter(inv => (inv.client_name ?? '').toLowerCase().includes(term) || inv.id.toString().includes(term))
  }, [invoicesQuery.data, search])

  const summary = useMemo(() => {
    const activeInvoices = filteredInvoices.filter(i => i.status !== 'voided')
    return activeInvoices.reduce(
      (acc, inv) => {
        acc.lbp += getInvoiceLbp(inv)
        acc.usd += getInvoiceUsd(inv)
        return acc
      },
      { usd: 0, lbp: 0, count: activeInvoices.length }
    )
  }, [filteredInvoices])

  const invoiceItemsQuery = useQuery({
    queryKey: ['sales', 'invoice-items', selectedInvoice?.id],
    enabled: detailsDialogOpen && Boolean(selectedInvoice?.id),
    queryFn: async (): Promise<InvoiceItem[]> => {
      if (!selectedInvoice?.id) return []
      const { data, error } = await supabase.from('invoice_items').select('*').eq('invoice_id', selectedInvoice.id).order('id', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const draftTotal = useMemo(() => lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0), [lines])

  const saveInvoiceMutation = useMutation({
    mutationFn: async () => {
      const cleanedClientName = clientName.trim()
      if (!cleanedClientName) throw new Error('Client selection is required')
      const validLines = lines.filter(line => line.productName.trim() && line.qty > 0 && line.unitPrice > 0)
      if (validLines.length === 0) throw new Error('Add valid line items')

      // Stock availability check
      for (const line of validLines) {
        if (!line.productId) continue
        const { data: prod } = await supabase.from('products').select('quantity, description').eq('id', line.productId).single()
        if (prod && (prod as any).quantity < line.qty) {
          throw new Error(`Insufficient stock for "${(prod as any).description}": only ${(prod as any).quantity} available, tried to sell ${line.qty}`)
        }
      }

      const matchedClient = clients.find(c => c.full_name.trim().toLowerCase() === cleanedClientName.toLowerCase())
      const isLbpPayment = paymentMethod === 'Cash LBP'

      const { data: invoiceRow, error: invoiceError } = await (supabase as any)
        .from('invoices')
        .insert({
          client_id: matchedClient?.id ?? null,
          client_name: cleanedClientName,
          total_usd: isLbpPayment ? 0 : draftTotal,
          total_lbp: isLbpPayment ? draftTotal : 0,
          payment_method: paymentMethod,
          status: 'saved',
          created_by: profile?.name ?? 'system',
          station: profile?.station ?? '',
        })
        .select('*')
        .single()
      if (invoiceError) throw invoiceError

      const { error: linesError } = await (supabase as any).from('invoice_items').insert(
        validLines.map(line => ({
          invoice_id: invoiceRow.id,
          product_id: line.productId,
          product_name: line.productName.trim(),
          quantity: line.qty,
          unit_price: line.unitPrice,
          currency: isLbpPayment ? 'LBP' : 'USD',
          total: line.qty * line.unitPrice,
        })),
      )
      if (linesError) throw linesError
      await log('invoice_saved', 'Sales', `Invoice #${invoiceRow.id} created`)
      return invoiceRow
    },
    onSuccess: (invoiceRow) => {
      toast.success(`Invoice #${invoiceRow.id} saved`)
      void queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY })
      setClientName(''); setPaymentMethod('Cash USD'); setLines([{ productName: '', productId: null, qty: 1, unitPrice: 0 }]); setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const requestVoidMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice || !voidReason.trim()) throw new Error('Reason required')
      const isCreator = selectedInvoice.created_by === profile?.name
      if (!isCreator && !canApproveVoid) throw new Error('Only the invoice creator or an admin can request a void')
      const { error } = await (supabase as any).from('invoices').update({ status: 'void_requested', void_reason: voidReason.trim(), void_requested_by: profile?.name ?? 'system' }).eq('id', selectedInvoice.id)
      if (error) throw error
      await log('void_requested', 'Voids', `Void requested for #${selectedInvoice.id}`)
    },
    onSuccess: () => {
      toast.success('Void requested'); void queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY }); setVoidDialogOpen(false); setSelectedInvoice(null); setVoidReason('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const approveVoidMutation = useMutation({
    mutationFn: async (invoice: Invoice) => {
      // 1. Mark invoice as voided
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ status: 'voided', void_approved_by: profile?.name ?? 'system' })
        .eq('id', invoice.id)
      if (error) throw error

      // 2. Restore stock quantities for each line item
      const { data: items } = await supabase
        .from('invoice_items')
        .select('product_id, quantity')
        .eq('invoice_id', invoice.id)

      for (const item of (items ?? []) as any[]) {
        if (!item.product_id || !item.quantity) continue
        const { data: prod } = await supabase
          .from('products')
          .select('id, quantity')
          .eq('id', item.product_id)
          .single()
        if (prod) {
          const restoredQty = ((prod as any).quantity ?? 0) + item.quantity
          await (supabase as any)
            .from('products')
            .update({ quantity: restoredQty })
            .eq('id', item.product_id)
        }
      }

      await log('void_approved', 'Voids', `Void approved for Invoice #${invoice.id} — stock restored for ${(items ?? []).length} item(s)`)
    },
    onSuccess: () => {
      toast.success('Void approved'); void queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateLine = (index: number, next: Partial<InvoiceLineDraft>) => setLines(prev => prev.map((line, i) => (i === index ? { ...line, ...next } : line)))
  const addLine = () => setLines(prev => [...prev, { productName: '', productId: null, qty: 1, unitPrice: 0 }])

  // Barcode scanner handler — fires from USB scanner or camera scan
  // Auto-opens the invoice sheet if it isn't already open
  const handleBarcodeScan = async (barcode: string) => {
    const result = await lookupBarcode(barcode)
    if (result.found) {
      const p = result.product
      // Auto-open sheet if closed
      if (!sheetOpen) setSheetOpen(true)
      setLines(prev => {
        const nonEmpty = prev.filter(l => l.productName.trim() || l.unitPrice > 0)
        return [...nonEmpty, { productName: p.description, productId: p.id, qty: 1, unitPrice: p.selling }]
      })
      toast.success(`✓ ${p.description} — ${p.currency === 'LBP' ? p.selling.toLocaleString() + ' LBP' : '$' + p.selling.toFixed(2)}`, { duration: 2500 })
    } else if (result.reason === 'not_found') {
      toast.error(`Barcode "${barcode}" not found — assign it in Products first`, { duration: 4000 })
    } else {
      toast.warning(`Product is inactive — reactivate it in Products first`)
    }
  }

  // Always active on Sales page — auto-opens invoice sheet when a scan arrives
  useBarcode({ onScan: handleBarcodeScan, active: canUseSales })
  const removeLine = (index: number) => setLines(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))

  const resolveProductForLine = (index: number) => {
    const typedValue = lines[index]?.productName.trim().toLowerCase()
    if (!typedValue) return
    let m = products.find(p => p.barcode?.toLowerCase() === typedValue) || products.find(p => p.description.toLowerCase() === typedValue) || products.find(p => p.description.toLowerCase().includes(typedValue))
    if (m) updateLine(index, { productName: m.description, productId: m.id, unitPrice: m.selling })
  }

  if (!canUseSales) return <div className="h-[60vh] flex flex-col items-center justify-center space-y-4"><AlertCircle className="w-12 h-12 text-destructive opacity-30" /><h2 className="text-xl font-bold">Access Denied</h2></div>

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      
      {/* Platform Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_indigo]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Sales Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Transaction Ledger</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Audit, analyze, and manage customer invoicing workflows.</p>
        </div>

        <div className="flex items-center gap-3">
          <Sheet open={sheetOpen} onOpenChange={(open) => {
              setSheetOpen(open)
              if (!open) {
                setClientName(''); setPaymentMethod('Cash USD')
                setLines([{ productName: '', productId: null, qty: 1, unitPrice: 0 }])
              }
            }}>
            <SheetTrigger asChild>
              <Button className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-indigo-600/20 group">
                <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
                NEW SALE
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
              <div className="p-8 bg-indigo-600 text-white">
                <h2 className="text-2xl font-black uppercase tracking-tighter italic">CREATE INVOICE</h2>
                <p className="text-indigo-100 text-sm font-medium">Capture transaction details and payment status.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Selection</Label>
                      <Input list="sales-clients" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Type name..." className="h-12 border-2 font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Payment Method</Label>
                      <Select value={paymentMethod} onValueChange={(v: PaymentMethod) => setPaymentMethod(v)}>
                        <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Line Items</Label>
                      <div className="flex items-center gap-2">
                        <BarcodeCamera
                          onScan={handleBarcodeScan}
                          label="Scan"
                          hint=""
                          className="h-6 text-[9px] border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                        />
                        <Button variant="ghost" size="sm" onClick={addLine} className="h-6 text-[9px] font-black uppercase text-indigo-600">Add Product +</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {lines.map((line, idx) => (
                        <div key={idx} className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                          <Input list="sales-products" placeholder="Product..." value={line.productName} onChange={e => updateLine(idx, { productName: e.target.value })} onBlur={() => resolveProductForLine(idx)} className="h-10 border-2 text-sm font-bold" />
                          <Input type="number" value={line.qty} onChange={e => updateLine(idx, { qty: Number(e.target.value) })} className="w-16 h-10 border-2 font-mono text-center font-bold" />
                          <div className="relative w-24">
                            <span className="absolute left-2 top-2.5 text-[10px] font-black text-muted-foreground">$</span>
                            <Input type="number" value={line.unitPrice} onChange={e => updateLine(idx, { unitPrice: Number(e.target.value) })} className="h-10 pl-5 border-2 font-mono text-right font-bold" />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} className="h-10 w-10 text-muted-foreground hover:text-rose-600"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-secondary/30 rounded-3xl border-2 border-dashed space-y-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Grand Total</p>
                  <p className="text-4xl font-mono font-black text-indigo-600 italic">
                    {paymentMethod === 'Cash LBP' ? fmtMoney(draftTotal, 'LBP') : fmtMoney(draftTotal, 'USD')}
                  </p>
                  {paymentMethod !== 'Cash LBP' && (
                    <Badge variant="outline" className="font-mono text-[10px] border-indigo-200 text-indigo-600">≈ {fmtMoney(draftTotal * USD_RATE, 'LBP')}</Badge>
                  )}
                </div>
              </div>
              <div className="p-8 bg-secondary/10 border-t">
                <Button className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg rounded-2xl" onClick={() => saveInvoiceMutation.mutate()} disabled={saveInvoiceMutation.isPending || draftTotal <= 0}>
                  {saveInvoiceMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'SAVE & POST INVOICE'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Decluttered Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Today Revenue', value: fmtMoney(summary.usd), icon: TrendingUp, color: 'text-emerald-600', sub: 'Calculated in USD' },
          { label: 'Invoice Count', value: summary.count, icon: Receipt, color: 'text-indigo-600', sub: 'Today Activity' },
          { label: 'Exchange Rate', value: `${USD_RATE.toLocaleString()} LBP`, icon: DollarSign, color: 'text-amber-600', sub: 'Live System Rate' },
          { label: 'Suspicious Logs', value: filteredInvoices.filter(i => i.status === 'void_requested').length, icon: ShieldCheck, color: 'text-rose-600', sub: 'Needs Attention' },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary"><s.icon className="w-4 h-4 text-muted-foreground" /></div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Unified Search & Ledger */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Transaction Ledger</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Global Audit Stream</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Ledger..." className="pl-10 h-10 border-2 rounded-xl text-xs font-bold" />
            </div>
            <Select value={range} onValueChange={(v: any) => setRange(v)}>
              <SelectTrigger className="w-36 h-10 border-2 rounded-xl font-bold text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="w-20 pl-6 text-[10px] font-black uppercase">Ref #</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Customer / Origin</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Total (USD)</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Method</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesQuery.isLoading && <SkeletonRows cols={6} />}
              {filteredInvoices.map(inv => (
                <TableRow key={inv.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6 font-mono text-[10px] font-black text-muted-foreground">#{inv.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-black text-sm tracking-tight uppercase leading-none mb-1">{inv.client_name || 'Walk-in'}</span>
                      <span className="text-[9px] font-mono font-bold text-muted-foreground opacity-60 uppercase">{fmtDateTime(inv.created_at)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-sm">
                    {fmtMoney(getInvoiceUsd(inv), 'USD')}
                    <p className="text-[9px] font-bold text-muted-foreground italic leading-none mt-1 opacity-50">≈ {fmtMoney(getInvoiceLbp(inv), 'LBP')}</p>
                  </TableCell>
                  <TableCell className="text-center"><MethodBadge method={inv.payment_method} /></TableCell>
                  <TableCell className="text-center"><StatusBadge status={inv.status} /></TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedInvoice(inv); setDetailsDialogOpen(true) }} className="h-8 w-8 text-indigo-600 hover:bg-indigo-50"><Eye className="w-4 h-4" /></Button>
                      {inv.status === 'void_requested' && canApproveVoid ? (
                        <Button variant="ghost" size="icon" onClick={() => approveVoidMutation.mutate(inv)} disabled={approveVoidMutation.isPending} className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" title="Approve void"><CheckCircle2 className="w-4 h-4" /></Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedInvoice(inv); setVoidDialogOpen(true) }} className="h-8 w-8 text-rose-600 hover:bg-rose-50" disabled={inv.status === 'voided'}><XCircle className="w-4 h-4" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <datalist id="sales-clients">{clients.map(c => <option key={c.id} value={c.full_name} />)}</datalist>
      <datalist id="sales-products">{products.map(p => <option key={p.id} value={p.description} />)}</datalist>

      {/* Detail Dialog Redesign */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-2 rounded-3xl">
          <div className="p-8 bg-secondary/30 border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/20"><Receipt className="w-6 h-6" /></div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter italic">INVOICE DETAIL</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Record Ref #{selectedInvoice?.id}</p>
              </div>
            </div>
            <StatusBadge status={selectedInvoice?.status || 'saved'} />
          </div>
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'Customer', val: selectedInvoice?.client_name || 'Walk-in', icon: User },
                { label: 'Agent', val: selectedInvoice?.created_by || 'system', icon: ShieldCheck },
                { label: 'Station', val: selectedInvoice?.station || 'Main', icon: Building2 },
                { label: 'Payment', val: selectedInvoice?.payment_method || 'Cash', icon: Wallet },
              ].map(info => (
                <div key={info.label}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 leading-none">{info.label}</p>
                  <p className="text-xs font-bold flex items-center gap-1.5"><info.icon className="w-3 h-3 text-indigo-500" /> {info.val}</p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="rounded-2xl border-2 overflow-hidden">
              <Table className="aw-table">
                <TableHeader className="bg-secondary/40">
                  <TableRow><TableHead className="text-[10px] font-black uppercase">Product</TableHead><TableHead className="text-center text-[10px] font-black uppercase">Qty</TableHead><TableHead className="text-right text-[10px] font-black uppercase pr-6">Price</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(invoiceItemsQuery.data ?? []).map(item => (
                    <TableRow key={item.id} className="border-b-0 hover:bg-transparent">
                      <TableCell className="text-xs font-bold uppercase">{item.product_name}</TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-black pr-6">{fmtMoney(normalizeMoney(item.total, item.currency === 'LBP' ? 'LBP' : 'USD'), item.currency === 'LBP' ? 'LBP' : 'USD')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col items-end pt-4 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Balance Payable</p>
              <p className="text-4xl font-mono font-black text-indigo-600">{fmtMoney(getInvoiceUsd(selectedInvoice), 'USD')}</p>
              <p className="text-[10px] font-bold text-muted-foreground opacity-50 font-mono">≈ {fmtMoney(getInvoiceLbp(selectedInvoice), 'LBP')}</p>
            </div>
          </div>
          <div className="p-6 bg-secondary/10 border-t flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold gap-2" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print Receipt</Button>
            <Button variant="secondary" size="sm" className="h-10 rounded-xl font-bold" onClick={() => setDetailsDialogOpen(false)}>Close Archive</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Dialog Redesign */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-3xl border-2">
          <div className="p-8 bg-rose-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">REQUEST VOID</h2>
            <p className="text-rose-100 text-sm font-medium">This action triggers an admin audit.</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Void Rationale</Label>
              <Input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for cancellation..." className="h-12 border-2 font-bold" />
            </div>
            <Button className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-rose-600/20" onClick={() => requestVoidMutation.mutate()} disabled={requestVoidMutation.isPending || !voidReason.trim()}>
              {requestVoidMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'CONFIRM VOID'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShieldCheck(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" />
    </svg>
  )
}
