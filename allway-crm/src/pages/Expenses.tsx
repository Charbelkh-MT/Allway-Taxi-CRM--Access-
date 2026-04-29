import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useSuppliersCache } from '@/hooks/useSuppliersCache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { 
  Receipt, 
  Plus, 
  History, 
  TrendingDown, 
  Calendar, 
  FileText, 
  User, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search,
  ArrowDownCircle,
  Building2
} from 'lucide-react'
import { ExpenseStatusBadge, UserBadge } from '@/components/shared/Badges'
import type { Expense } from '@/types/database'

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
  const isSup = role === 'admin' || role === 'supervisor'
  
  const { data: suppliers = [] } = useSuppliersCache()

  const [activeTab, setActiveTab] = useState('history')
  const [fromDate, setFromDate] = useState(formatDate(new Date(), 'yyyy-MM-01'))
  const [toDate, setToDate] = useState(formatDate(new Date(), 'yyyy-MM-dd'))

  const [exSupplierId, setExSupplierId] = useState('')
  const [exUsd, setExUsd] = useState('0')
  const [exLbp, setExLbp] = useState('0')
  const [exDesc, setExDesc] = useState('')
  const [exNote, setExNote] = useState('')
  const [search, setSearch] = useState('')

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
    const data = expensesQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(e => 
      e.supplier.toLowerCase().includes(s) || 
      e.description.toLowerCase().includes(s)
    )
  }, [expensesQuery.data, search])

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
    },
    onSuccess: () => {
      toast.success('Expense submitted for supervisor approval')
      void queryClient.invalidateQueries({ queryKey: QK })
      setExSupplierId(''); setExUsd('0'); setExLbp('0'); setExDesc(''); setExNote('')
      setActiveTab('history')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to submit expense'),
  })

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase as any).from('expenses').update({ status: 'approved', approved_by: profile?.name }).eq('id', id)
      if (error) throw error
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
    },
    onSuccess: () => { 
      toast.success('Expense rejected')
      void queryClient.invalidateQueries({ queryKey: QK }) 
    },
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Expense Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track business spending, supplier payments, and approvals.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-orange-500/5 border-orange-500/20">
            <div className="mr-3 p-2 bg-orange-500/10 rounded-full text-orange-600">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Approved Total</p>
              <p className="text-lg font-bold font-mono leading-none text-orange-600">{fmtMoney(stats.approvedTotalUsd)}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-amber-500/5 border-amber-500/20">
            <div className="mr-3 p-2 bg-amber-500/10 rounded-full text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Pending Approval</p>
              <p className="text-lg font-bold font-mono leading-none text-amber-600">{stats.pendingCount}</p>
            </div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <TabsList className="grid grid-cols-2 w-[350px]">
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Expense History
              </TabsTrigger>
              <TabsTrigger value="new" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Log Expense
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'history' && (
              <div className="hidden sm:flex items-center gap-2 bg-secondary/30 px-3 py-1.5 rounded-lg border">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <Input 
                  type="date" 
                  value={fromDate} 
                  onChange={e => setFromDate(e.target.value)} 
                  className="h-7 w-32 text-[11px] bg-transparent border-none focus-visible:ring-0" 
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Input 
                  type="date" 
                  value={toDate} 
                  onChange={e => setToDate(e.target.value)} 
                  className="h-7 w-32 text-[11px] bg-transparent border-none focus-visible:ring-0" 
                />
              </div>
            )}
          </div>

          {activeTab === 'history' && (
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search suppliers, items..." 
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
                  <TableHead className="w-[200px]">Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="max-w-[200px]">Description</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">By</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                  {isSup && <TableHead className="text-right">Approval</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesQuery.isLoading && <TableRow><TableCell colSpan={isSup ? 7 : 6} className="text-center py-20 text-muted-foreground italic">Syncing expenses...</TableCell></TableRow>}
                {!expensesQuery.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={isSup ? 7 : 6} className="text-center py-20 text-muted-foreground">No expense records found for this period.</TableCell></TableRow>}
                {filtered.map((e: any) => (
                  <TableRow key={e.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-100 rounded-full text-orange-700">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-sm tracking-tight">{e.supplier}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        {e.amount_usd > 0 && <span className="font-mono text-sm font-bold text-green-600">{fmtMoney(e.amount_usd)}</span>}
                        {e.amount_lbp > 0 && <span className="font-mono text-[10px] text-blue-600">{fmtMoney(e.amount_lbp, 'LBP')}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-xs text-muted-foreground line-clamp-1 italic">{e.description}</p>
                      {e.note && <p className="text-[10px] text-muted-foreground/60 line-clamp-1">{e.note}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <ExpenseStatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={e.submitted_by} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                      {formatDate(e.created_at, 'dd/MM/yyyy')}
                    </TableCell>
                    {isSup && (
                      <TableCell className="text-right">
                        {e.status === 'pending' && (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => approveMutation.mutate(e.id)}>
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/5" onClick={() => rejectMutation.mutate(e.id)}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {e.status !== 'pending' && (
                          <span className="text-[10px] text-muted-foreground italic font-medium">
                            By {e.approved_by || 'system'}
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <Card className="border-2 border-orange-500/20 shadow-md">
            <CardHeader className="bg-orange-500/5 pb-4">
              <CardTitle className="text-xl flex items-center gap-2 text-orange-700">
                <Receipt className="w-5 h-5" />
                Log Business Expense
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Supplier / Vendor *</Label>
                    <Select value={exSupplierId} onValueChange={setExSupplierId}>
                      <SelectTrigger className="h-11 shadow-sm"><SelectValue placeholder="Select a supplier..." /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expense Description *</Label>
                    <Input 
                      value={exDesc} 
                      onChange={e => setExDesc(e.target.value)} 
                      placeholder="What was this for?" 
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-6 p-6 bg-secondary/20 rounded-xl border border-secondary">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount USD</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                      <Input 
                        type="number" 
                        step="0.01" 
                        value={exUsd} 
                        onChange={e => setExUsd(e.target.value)} 
                        className="h-11 pl-8 font-mono text-lg font-bold text-green-600 bg-white" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount LBP</Label>
                    <Input 
                      type="number" 
                      value={exLbp} 
                      onChange={e => setExLbp(e.target.value)} 
                      className="h-11 font-mono text-lg text-blue-600 bg-white" 
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal Note</Label>
                    <Input 
                      value={exNote} 
                      onChange={e => setExNote(e.target.value)} 
                      placeholder="Extra details (Optional)" 
                      className="h-11"
                    />
                  </div>
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-orange-800 font-bold mb-1">
                      <Clock className="w-3 h-3" /> Approval Required
                    </div>
                    <p className="text-[10px] text-orange-700 leading-tight">
                      New expenses will be marked as **Pending** and require supervisor approval before impacting the final PNL.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-secondary/40 px-4 py-2 rounded-full">
                  <User className="w-4 h-4 text-primary" />
                  Submitting as <span className="font-bold text-foreground">{profile?.name}</span>
                </div>
                <Button 
                  onClick={() => submitExpenseMutation.mutate()} 
                  disabled={submitExpenseMutation.isPending} 
                  className="w-full sm:w-64 h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg shadow-lg shadow-orange-600/20"
                >
                  {submitExpenseMutation.isPending ? 'Submitting...' : 'Submit Expense'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
