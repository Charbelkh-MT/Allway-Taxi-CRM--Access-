import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt, fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { Globe, Plus, TrendingUp, CheckCircle2, Clock, ShieldCheck, AlertCircle, Search, ArrowUpRight, DollarSign, PlusCircle, Pencil } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'

const PROVIDERS = ['IDM', 'Ogero', 'Terranet', 'Sodetel', 'Cyberia', 'Connect', 'Mobi', 'Wise']
const QK = ['internet_recharges']

export default function Internet() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin'

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingRecharge, setEditingRecharge] = useState<any>(null)
  const [provider, setProvider] = useState(PROVIDERS[0])
  const [plan, setPlan] = useState('')
  const [account, setAccount] = useState('')
  const [custName, setCustName] = useState('')
  const [usd, setUsd] = useState('0')
  const [lbp, setLbp] = useState('0')
  const [search, setSearch] = useState('')

  const rechargesQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('internet_recharges').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = rechargesQuery.data ?? []
    const today = new Date().toISOString().split('T')[0]
    const todaySales = data.filter(r => r.created_at.startsWith(today))
    const totalUsd = todaySales.reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0)
    const pendingCount = data.filter(r => !r.verified).length
    
    return {
      todayCount: todaySales.length,
      todayUsd: totalUsd,
      pendingCount
    }
  }, [rechargesQuery.data])

  const filteredRecharges = useMemo(() => {
    const data = rechargesQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(r => 
      r.customer_account.toLowerCase().includes(s) || 
      (r.customer_name?.toLowerCase().includes(s)) ||
      r.provider.toLowerCase().includes(s)
    )
  }, [rechargesQuery.data, search])

  function handleEdit(r: any) {
    setEditingRecharge(r)
    setProvider(r.provider)
    setPlan(r.plan || '')
    setAccount(r.customer_account)
    setCustName(r.customer_name || '')
    setUsd(String(normalizeMoney(r.amount_usd, 'USD')))
    setLbp(String(normalizeMoney(r.amount_lbp, 'LBP')))
    setSheetOpen(true)
  }

  function resetForm() {
    setEditingRecharge(null)
    setProvider(PROVIDERS[0]); setPlan(''); setAccount(''); setCustName(''); setUsd('0'); setLbp('0')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account.trim()) throw new Error('Customer account number is required')
      if (parseFloat(usd) <= 0 && parseInt(lbp) <= 0) throw new Error('Please enter a valid amount')
      
      const payload = {
        provider, plan: plan.trim(), customer_account: account.trim(), customer_name: custName.trim(),
        amount_usd: parseFloat(usd) || 0, amount_lbp: parseInt(lbp) || 0,
        created_by: profile?.name ?? 'system', station: profile?.station ?? '',
      }

      if (editingRecharge) {
        const { error } = await (supabase as any).from('internet_recharges').update(payload).eq('id', editingRecharge.id)
        if (error) throw error
        await log('internet_edited', 'Internet', `Updated recharge — account ${account.trim()} (#${editingRecharge.id})`)
      } else {
        const { error } = await (supabase as any).from('internet_recharges').insert(payload)
        if (error) throw error
        await log('internet_recharge', 'Internet', `${provider} recharge — account ${account.trim()} — $${usd}`)
      }
    },
    onSuccess: () => {
      toast.success(editingRecharge ? 'Recharge updated' : 'Recharge logged successfully')
      void queryClient.invalidateQueries({ queryKey: QK })
      resetForm()
      setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save recharge'),
  })

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase as any).from('internet_recharges').update({ verified: true, verified_by: profile?.name }).eq('id', id)
      if (error) throw error
      await log('internet_verified', 'Internet', `Recharge #${id} verified by ${profile?.name}`)
    },
    onSuccess: () => { toast.success('Recharge verified'); void queryClient.invalidateQueries({ queryKey: QK }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Verification failed'),
  })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-sky-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Internet Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Internet Recharges</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Track and manage broadband renewals across all providers.</p>
        </div>
        <Button
          onClick={() => { resetForm(); setSheetOpen(true) }}
          className="h-12 bg-sky-600 hover:bg-sky-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-sky-600/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          NEW RECHARGE
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: "Today's Revenue", value: fmtMoney(stats.todayUsd), icon: DollarSign, color: 'text-emerald-600', sub: 'USD collected today' },
          { label: "Today's Recharges", value: stats.todayCount, icon: Globe, color: 'text-sky-600', sub: 'Processed today' },
          { label: 'Pending Audit', value: stats.pendingCount, icon: ShieldCheck, color: 'text-amber-600', sub: 'Awaiting verification' },
          { label: 'Total Records', value: (rechargesQuery.data ?? []).length, icon: TrendingUp, color: 'text-indigo-600', sub: 'All-time entries' },
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

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-800 font-medium leading-none">
          Verify account numbers carefully. Incorrect entries can lead to recharge failures.
        </p>
      </div>

      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Recharge History</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filteredRecharges.length} results</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts, clients..."
              className="pl-10 h-10 border-2 rounded-xl text-xs font-bold"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 text-[10px] font-black uppercase">Provider</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Account #</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Customer</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Amount</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">By</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rechargesQuery.isLoading && <SkeletonRows cols={7} />}
              {!rechargesQuery.isLoading && filteredRecharges.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No recharge records found.</TableCell></TableRow>}
              {filteredRecharges.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6">
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 uppercase tracking-tight text-[9px] font-black">
                      {r.provider}
                    </Badge>
                    <p className="text-[9px] text-muted-foreground mt-1 font-mono uppercase font-bold">{r.plan || 'No Plan'}</p>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-black tracking-tight">{r.customer_account}</TableCell>
                  <TableCell>
                    <p className="text-sm font-black tracking-tight uppercase">{r.customer_name || 'Anonymous'}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.amount_usd > 0 && <p className="font-mono text-sm font-black text-emerald-600">{fmtMoney(r.amount_usd)}</p>}
                    {r.amount_lbp > 0 && <p className="font-mono text-[10px] font-bold text-indigo-600">{fmtMoney(r.amount_lbp, 'LBP')}</p>}
                  </TableCell>
                  <TableCell className="text-center">
                    <UserBadge name={r.created_by} />
                  </TableCell>
                  <TableCell className="text-center">
                    {r.verified ? (
                      <div className="flex items-center justify-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase">Verified</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-black">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!r.verified && isSup && (
                        <Button size="sm" variant="outline" className="h-8 text-[10px] px-3 font-black border-2 rounded-xl" onClick={() => verifyMutation.mutate(r.id)}>Verify</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-600 hover:bg-sky-50" onClick={() => handleEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recharge Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) resetForm() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <div className="p-8 bg-sky-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">
              {editingRecharge ? 'EDIT RECHARGE' : 'LOG NEW RECHARGE'}
            </h2>
            <p className="text-sky-100 text-sm font-medium">Record broadband recharges for all providers.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Service Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Plan / Package</Label>
              <Input value={plan} onChange={e => setPlan(e.target.value)} placeholder="e.g. 100GB Monthly" className="h-12 border-2 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Account Number *</Label>
              <Input value={account} onChange={e => setAccount(e.target.value)} placeholder="Enter customer ID..." className="h-12 border-2 font-mono font-bold text-lg tracking-tight" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Name</Label>
              <Input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Full name (optional)" className="h-12 border-2 font-bold" />
            </div>
            <div className="p-5 bg-sky-50 rounded-2xl border-2 border-sky-200 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-sky-700">Billing Amount</p>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Amount USD</Label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-sky-800/50 font-mono font-black">$</span>
                  <Input type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} className="h-12 pl-8 border-2 font-mono text-lg font-black border-sky-300 focus:border-sky-500 text-emerald-600" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Amount LBP</Label>
                <Input type="number" value={lbp} onChange={e => setLbp(e.target.value)} className="h-12 border-2 font-mono text-lg font-black border-sky-300 focus:border-sky-500 text-indigo-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              Logged as {profile?.name}
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-14 bg-sky-600 hover:bg-sky-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-sky-600/20"
            >
              {saveMutation.isPending ? 'PROCESSING...' : editingRecharge ? 'UPDATE RECORD' : 'LOG RECHARGE'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
