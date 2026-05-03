import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney, cn } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useSuppliersCache } from '@/hooks/useSuppliersCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import {
  Receipt,
  Plus,
  Calendar,
  FileText,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Building2,
  ArrowUpRight,
  PlusCircle,
  Filter,
} from 'lucide-react'
import { ExpenseStatusBadge, UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import type { Expense } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'

// Native date helper instead of date-fns
const formatDate = (date: Date | string, pattern: string) => {
  const d = new Date(date)
  if (pattern === 'yyyy-MM-dd') return d.toISOString().split('T')[0]
  if (pattern === 'yyyy-MM-01') return d.toISOString().split('T')[0].slice(0, 8) + '01'
  return d.toLocaleDateString('en-GB').split('/').join('/') // dd/mm/yyyy
}

const QK = ['expenses']

export default function Expenses() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin'
  
  const { data: suppliers = [] } = useSuppliersCache()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [fromDate, setFromDate] = useState(formatDate(new Date(), 'yyyy-MM-01'))
  const [toDate, setToDate] = useState(formatDate(new Date(), 'yyyy-MM-dd'))
  const [datePreset, setDatePreset] = useState<'today' | '7d' | '30d' | 'month' | 'custom'>('month')

  function applyPreset(preset: typeof datePreset) {
    setDatePreset(preset)
    const now = new Date()
    const today = formatDate(now, 'yyyy-MM-dd')
    if (preset === 'today') {
      setFromDate(today); setToDate(today)
    } else if (preset === '7d') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      setFromDate(formatDate(d, 'yyyy-MM-dd')); setToDate(today)
    } else if (preset === '30d') {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      setFromDate(formatDate(d, 'yyyy-MM-dd')); setToDate(today)
    } else if (preset === 'month') {
      setFromDate(formatDate(now, 'yyyy-MM-01')); setToDate(today)
    }
  }

  const [exSupplierId, setExSupplierId] = useState('')
  const [exUsd, setExUsd] = useState('0')
  const [exLbp, setExLbp] = useState('0')
  const [exDesc, setExDesc] = useState('')
  const [exNote, setExNote] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [submitterFilter, setSubmitterFilter] = useState('all')

  const expensesQuery = useQuery({
    queryKey: [...QK, fromDate, toDate],
    queryFn: async (): Promise<Expense[]> => {
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('created_at', `${fromDate}T00:00:00Z`)
        .lte('created_at', `${toDate}T23:59:59Z`)
        .order('created_at', { ascending: false })
      
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })


  // All unique submitters for filter dropdown
  const submitters = useMemo(() => {
    return [...new Set((expensesQuery.data ?? []).map((e: any) => e.submitted_by))].filter(Boolean).sort()
  }, [expensesQuery.data])

  const stats = useMemo(() => {
    const data = expensesQuery.data ?? []
    const pendingCount = data.filter(e => e.status === 'pending').length
    const approvedTotalUsd = data
      .filter(e => e.status === 'approved')
      .reduce((sum, e) => {
        const usd = normalizeMoney(e.amount_usd, 'USD')
        const lbp = normalizeMoney(e.amount_lbp, 'LBP')
        return sum + usd + (lbp / 90000)
      }, 0)
    
    return {
      pendingCount,
      approvedTotalUsd,
      count: data.length
    }
  }, [expensesQuery.data])

  const filtered = useMemo(() => {
    let data = expensesQuery.data ?? []
    if (statusFilter !== 'all') data = data.filter(e => e.status === statusFilter)
    if (submitterFilter !== 'all') data = data.filter((e: any) => e.submitted_by === submitterFilter)
    if (search.trim()) {
      const s = search.toLowerCase()
      data = data.filter(e =>
        e.supplier.toLowerCase().includes(s) ||
        e.description.toLowerCase().includes(s)
      )
    }
    return data
  }, [expensesQuery.data, search, statusFilter, submitterFilter])

  const submitExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!exSupplierId) throw new Error('Supplier is required')
      if (!exDesc.trim()) throw new Error('Description is required')
      
      const usd = parseFloat(exUsd) || 0
      const lbp = parseInt(exLbp) || 0

      if (usd <= 0 && lbp <= 0) throw new Error('Please enter an amount (USD or LBP)')

      const supplierName = suppliers.find(s => String(s.id) === exSupplierId)?.name ?? 'Unknown'

      const { error } = await (supabase as any).from('expenses').insert({
        supplier: supplierName,
        amount_usd: usd,
        amount_lbp: lbp,
        description: exDesc.trim(),
        note: exNote.trim(),
        submitted_by: profile?.name ?? 'system',
        station: profile?.station ?? '',
        status: 'pending',
      })
      if (error) throw error
      await log('expense_submitted', 'Expenses', `Expense: ${supplierName} $${usd} / ${lbp} LBP`)

      // Check expense threshold from Settings and warn admins
      const { data: settingsRow } = await (supabase as any).from('tblInformation').select('*').limit(1).single().catch(() => ({ data: null }))
      const threshold = parseFloat(settingsRow?.ExpenseThreshold ?? settingsRow?.expense_threshold ?? '50') || 50
      if (usd >= threshold) {
        toast.warning(`⚠ Large expense ($${usd}) submitted — admin approval required`, { duration: 6000 })
      }
    },
    onSuccess: () => {
      toast.success('Expense submitted for admin approval')
      void queryClient.invalidateQueries({ queryKey: QK })
      setExSupplierId(''); setExUsd('0'); setExLbp('0'); setExDesc(''); setExNote('')
      setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to submit expense'),
  })

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      // Fetch expense to check self-approval
      const { data: expense } = await (supabase as any).from('expenses').select('submitted_by, amount_usd, supplier').eq('id', id).single()
      if (expense && expense.submitted_by === profile?.name) {
        throw new Error('You cannot approve your own expense submission.')
      }
      const { error } = await (supabase as any).from('expenses').update({ status: 'approved', approved_by: profile?.name }).eq('id', id)
      if (error) throw error
      await log('expense_approved', 'Expenses', `Expense #${id} approved by ${profile?.name} — ${expense?.supplier} $${expense?.amount_usd}`)
    },
    onSuccess: () => { 
      toast.success('Expense approved')
      void queryClient.invalidateQueries({ queryKey: QK }) 
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase as any).from('expenses').update({ status: 'rejected', approved_by: profile?.name }).eq('id', id)
      if (error) throw error
      await log('expense_rejected', 'Expenses', `Expense #${id} rejected by ${profile?.name}`)
    },
    onSuccess: () => { 
      toast.success('Expense rejected')
      void queryClient.invalidateQueries({ queryKey: QK }) 
    },
  })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Expenses Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Expense Management</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Track business spending, supplier payments, and approvals.</p>
        </div>
        <Button
          onClick={() => setSheetOpen(true)}
          className="h-12 bg-amber-600 hover:bg-amber-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-amber-600/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          LOG EXPENSE
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Total Logged', value: stats.count, icon: Receipt, color: 'text-indigo-600', sub: 'All expenses' },
          { label: 'Approved Total', value: fmtMoney(stats.approvedTotalUsd), icon: CheckCircle2, color: 'text-emerald-600', sub: 'Approved spending' },
          { label: 'Pending Approval', value: stats.pendingCount, icon: Clock, color: 'text-amber-600', sub: 'Awaiting review' },
          { label: 'Rejected', value: (expensesQuery.data ?? []).filter((e: any) => e.status === 'rejected').length, icon: XCircle, color: 'text-rose-600', sub: 'Declined expenses' },
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

      {/* Date filter + history table */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Expense History</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filtered.length} results</CardDescription>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
            {/* Quick date presets */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: 'today', label: 'Today' },
                { key: '7d',    label: 'Last 7 Days' },
                { key: '30d',   label: 'Last 30 Days' },
                { key: 'month', label: 'This Month' },
                { key: 'custom',label: 'Custom' },
              ] as const).map(p => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-wide border-2 transition-all',
                    datePreset === p.key
                      ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                      : 'bg-background text-muted-foreground border-border hover:border-amber-300 hover:text-amber-700'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Custom date inputs — only shown when custom is selected */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 bg-secondary/50 px-3 py-2 rounded-xl border-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-7 w-28 text-[11px] bg-transparent border-none focus-visible:ring-0 font-bold" />
                <span className="text-muted-foreground text-xs font-black">→</span>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-7 w-28 text-[11px] bg-transparent border-none focus-visible:ring-0 font-bold" />
              </div>
            )}
            {/* Row 2: status + submitter + search */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-36 h-9 border-2 rounded-xl font-bold text-xs">
                  <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">⏳ Pending</SelectItem>
                  <SelectItem value="approved">✅ Approved</SelectItem>
                  <SelectItem value="rejected">❌ Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={submitterFilter} onValueChange={setSubmitterFilter}>
                <SelectTrigger className="w-36 h-9 border-2 rounded-xl font-bold text-xs">
                  <User className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {submitters.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-44">
                <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search…" className="pl-10 h-9 border-2 rounded-xl text-xs font-bold" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {(statusFilter !== 'all' || submitterFilter !== 'all' || search) && (
                <button
                  onClick={() => { setStatusFilter('all'); setSubmitterFilter('all'); setSearch('') }}
                  className="h-9 px-3 rounded-xl text-[10px] font-black uppercase text-destructive border-2 border-destructive/30 hover:bg-destructive/5 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 text-[10px] font-black uppercase w-[200px]">Supplier</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Amount</TableHead>
                <TableHead className="text-[10px] font-black uppercase max-w-[200px]">Description</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">By</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Date</TableHead>
                {isSup && <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Approval</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expensesQuery.isLoading && <SkeletonRows cols={7} />}
              {!expensesQuery.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={isSup ? 7 : 6} className="text-center py-20 text-muted-foreground">No expense records found for this period.</TableCell></TableRow>}
              {filtered.map((e: any) => (
                <TableRow key={e.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-100 rounded-xl text-amber-700">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-black text-sm tracking-tight uppercase">{e.supplier}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {e.amount_usd > 0 && <span className="font-mono text-sm font-black text-emerald-600">{fmtMoney(e.amount_usd)}</span>}
                      {e.amount_lbp > 0 && <span className="font-mono text-[10px] font-bold text-indigo-600">{fmtMoney(e.amount_lbp, 'LBP')}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-xs font-bold text-muted-foreground line-clamp-1">{e.description}</p>
                    {e.note && <p className="text-[9px] text-muted-foreground/60 line-clamp-1 italic">{e.note}</p>}
                  </TableCell>
                  <TableCell className="text-center"><ExpenseStatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-center"><UserBadge name={e.submitted_by} /></TableCell>
                  <TableCell className="text-right font-mono text-[10px] font-black text-muted-foreground">{formatDate(e.created_at, 'dd/MM/yyyy')}</TableCell>
                  {isSup && (
                    <TableCell className="text-right pr-6">
                      {e.status === 'pending' && (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => approveMutation.mutate(e.id)}><CheckCircle2 className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/5" onClick={() => rejectMutation.mutate(e.id)}><XCircle className="w-4 h-4" /></Button>
                        </div>
                      )}
                      {e.status !== 'pending' && <span className="text-[9px] text-muted-foreground italic font-bold">By {e.approved_by || 'system'}</span>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expense Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) { setExSupplierId(''); setExUsd('0'); setExLbp('0'); setExDesc(''); setExNote('') }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <div className="p-8 bg-amber-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">LOG BUSINESS EXPENSE</h2>
            <p className="text-amber-100 text-sm font-medium">Record spending for admin review and approval.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Supplier / Vendor *</Label>
              <Select value={exSupplierId} onValueChange={setExSupplierId}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue placeholder="Select a supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Expense Description *</Label>
              <Input value={exDesc} onChange={e => setExDesc(e.target.value)} placeholder="What was this for?" className="h-12 border-2 font-bold" />
            </div>
            <div className="p-5 bg-amber-50 rounded-2xl border-2 border-amber-200 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-amber-700">Amount</p>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Amount USD</Label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-amber-800/50 font-mono font-black">$</span>
                  <Input type="number" step="0.01" value={exUsd} onChange={e => setExUsd(e.target.value)} className="h-12 pl-8 border-2 font-mono text-lg font-black border-amber-300 text-emerald-600" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Amount LBP</Label>
                <Input type="number" value={exLbp} onChange={e => setExLbp(e.target.value)} className="h-12 border-2 font-mono text-lg font-black border-amber-300 text-indigo-600" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Internal Note</Label>
              <Input value={exNote} onChange={e => setExNote(e.target.value)} placeholder="Extra details (optional)" className="h-12 border-2 font-bold" />
            </div>
            <div className="p-4 rounded-2xl border-2 border-orange-200 bg-orange-50 flex gap-3">
              <Clock className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase text-orange-900">Approval Required</p>
                <p className="text-[10px] text-orange-700 leading-relaxed font-medium mt-0.5">Expenses are marked as Pending and require admin approval before affecting the PNL.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
              <User className="w-3.5 h-3.5 shrink-0" />
              Submitting as {profile?.name}
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => submitExpenseMutation.mutate()}
              disabled={submitExpenseMutation.isPending}
              className="w-full h-14 bg-amber-600 hover:bg-amber-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-amber-600/20"
            >
              {submitExpenseMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />SUBMITTING...</> : 'SUBMIT EXPENSE'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
