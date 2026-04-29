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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { UserBadge } from '@/components/shared/Badges'
import { Globe, Plus, History, TrendingUp, CheckCircle2, Clock, ShieldCheck, AlertCircle, Search } from 'lucide-react'

const PROVIDERS = ['IDM', 'Ogero', 'Terranet', 'Sodetel', 'Cyberia', 'Connect', 'Mobi', 'Wise']
const QK = ['internet_recharges']

export default function Internet() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin' || role === 'supervisor'

  const [activeTab, setActiveTab] = useState('history')
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
    setActiveTab('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      setActiveTab('history')
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
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Internet Recharges</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage broadband renewals across all providers.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-primary/5 border-primary/20">
            <div className="mr-3 p-2 bg-primary/10 rounded-full text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Today's Sales</p>
              <p className="text-lg font-bold font-mono leading-none text-primary">{fmtMoney(stats.todayUsd)}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-amber-500/5 border-amber-500/20">
            <div className="mr-3 p-2 bg-amber-500/10 rounded-full text-amber-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Pending Audit</p>
              <p className="text-lg font-bold font-mono leading-none text-amber-600">{stats.pendingCount}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-800 font-medium leading-none">
          Verify account numbers carefully. Incorrect entries can lead to recharge failures.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid grid-cols-2 w-[350px]">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {editingRecharge ? 'Edit Entry' : 'New Recharge'}
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'history' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search accounts, clients..." 
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
                  <TableHead>Provider</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">By</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rechargesQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">Loading records...</TableCell></TableRow>}
                {!rechargesQuery.isLoading && filteredRecharges.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No recharge records found.</TableCell></TableRow>}
                {filteredRecharges.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-tighter text-[10px] font-bold">
                        {r.provider}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">{r.plan || 'No Plan'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-bold tracking-tight">
                      {r.customer_account}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-none">{r.customer_name || 'Anonymous'}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.amount_usd > 0 && <p className="font-mono text-xs font-bold text-green-600">{fmtMoney(r.amount_usd)}</p>}
                      {r.amount_lbp > 0 && <p className="font-mono text-[10px] text-blue-600">{fmtMoney(r.amount_lbp, 'LBP')}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={r.created_by} />
                    </TableCell>
                    <TableCell className="text-center">
                      {r.verified ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-tight">Verified</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!r.verified && isSup && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 font-bold" onClick={() => verifyMutation.mutate(r.id)}>Verify</Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleEdit(r)}>
                          <Plus className="h-4 w-4 rotate-45" />
                        </Button>
                      </div>
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  {editingRecharge ? 'Edit Internet Recharge' : 'Log New Internet Recharge'}
                </CardTitle>
                {editingRecharge && (
                  <Button variant="ghost" size="sm" onClick={resetForm} className="text-destructive hover:bg-destructive/10">
                    Cancel Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Provider</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Plan / Package</Label>
                    <Input value={plan} onChange={e => setPlan(e.target.value)} placeholder="e.g. 100GB Monthly" className="h-11" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Number *</Label>
                    <Input 
                      value={account} 
                      onChange={e => setAccount(e.target.value)} 
                      placeholder="Enter customer ID..." 
                      className="h-11 font-mono text-lg tracking-tight"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer Name</Label>
                    <Input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Full name (optional)" className="h-11" />
                  </div>
                </div>

                <div className="space-y-6 p-6 bg-secondary/20 rounded-xl border border-secondary">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount USD</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">$</span>
                      <Input type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} className="h-11 pl-8 font-mono text-lg font-bold text-green-600" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount LBP</Label>
                    <Input type="number" value={lbp} onChange={e => setLbp(e.target.value)} className="h-11 font-mono text-lg text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-secondary/40 px-4 py-2 rounded-full">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Logged as <span className="font-bold text-foreground">{profile?.name}</span>
                </div>
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending} 
                  className="w-full sm:w-64 h-12 bg-primary hover:bg-primary/90 text-lg font-bold shadow-lg shadow-primary/20"
                >
                  {saveMutation.isPending ? 'Processing...' : editingRecharge ? 'Update Record' : 'Log Recharge'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
