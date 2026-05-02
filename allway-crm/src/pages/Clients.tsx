import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useRole, useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Users, Plus, Search, Phone, MessageSquare, Wallet, ArrowUpRight, UserCheck } from 'lucide-react'
import { DebtBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import type { Client, DebtStatus } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'

const QK = ['clients']

export default function Clients() {
  const queryClient = useQueryClient()
  const { log } = useAuditLog()
  const { profile: _p } = useAuth()
  const role = useRole()
  const canEdit = role === 'admin' || role === 'supervisor'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DebtStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [debtStatus, setDebtStatus] = useState<DebtStatus>('Unchecked')
  const [usdBalance, setUsdBalance] = useState('0')

  const clientsQuery = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').order('full_name', { ascending: true }).limit(1000)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = clientsQuery.data ?? []
    return {
      total: data.length,
      totalDebtUsd: data.filter(c => c.debt_status === 'Debt').reduce((s, c) => s + Math.abs(normalizeMoney(c.usd_balance, 'USD')), 0),
      cashClients: data.filter(c => c.debt_status === 'Cash').length,
      debtClients: data.filter(c => c.debt_status === 'Debt').length
    }
  }, [clientsQuery.data])

  const filtered = useMemo(() => {
    let rows = clientsQuery.data ?? []
    if (statusFilter !== 'all') rows = rows.filter(c => c.debt_status === statusFilter)
    const term = search.trim().toLowerCase()
    if (term) rows = rows.filter(c => c.full_name.toLowerCase().includes(term) || (c.mobile || '').includes(term) || c.id.toString().includes(term))
    return rows
  }, [clientsQuery.data, search, statusFilter])

  function handleOpenAdd() {
    setEditingClient(null); setName(''); setMobile(''); setDebtStatus('Unchecked'); setUsdBalance('0'); setDialogOpen(true)
  }
  function handleOpenEdit(c: Client) {
    setEditingClient(c); setName(c.full_name); setMobile(c.mobile || ''); setDebtStatus(c.debt_status)
    setUsdBalance(String(normalizeMoney(c.usd_balance, 'USD'))); setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Name required')
      const payload = { full_name: trimmed, mobile: mobile.trim(), debt_status: debtStatus, usd_balance: parseFloat(usdBalance) || 0 }
      if (editingClient) {
        const { error } = await (supabase as any).from('clients').update(payload).eq('id', editingClient.id)
        if (error) throw error
        const oldBal = editingClient.usd_balance ?? 0
        const newBal = parseFloat(usdBalance) || 0
        if (Math.abs(oldBal - newBal) > 0.01) {
          await log('balance_changed', 'Clients', `Balance: ${trimmed} (#${editingClient.id}) $${oldBal.toFixed(2)} → $${newBal.toFixed(2)}`)
        }
        if (editingClient.debt_status !== debtStatus) {
          await log('status_changed', 'Clients', `Status: ${trimmed} ${editingClient.debt_status} → ${debtStatus}`)
        }
        await log('client_edited', 'Clients', `Updated: ${trimmed}`)
      } else {
        // Prevent duplicate client names
        const { data: existing } = await supabase.from('clients').select('id').ilike('full_name', trimmed).limit(1)
        if (existing && (existing as any[]).length > 0) {
          throw new Error(`Client "${trimmed}" already exists. Search for them and use Edit instead.`)
        }
        const { error } = await (supabase as any).from('clients').insert(payload)
        if (error) throw error
        await log('client_added', 'Clients', `New: ${trimmed}`)
      }
    },
    onSuccess: () => { toast.success(editingClient ? 'Updated' : 'Registered'); void queryClient.invalidateQueries({ queryKey: QK }); setDialogOpen(false) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">CRM Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter italic uppercase">Client Directory</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Manage customer profiles, contact info, and credit balances.</p>
        </div>
        <Button onClick={handleOpenAdd} className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-blue-600/20">
          <Plus className="w-4 h-4 mr-2" /> ADD CLIENT
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Total Clients', value: stats.total, icon: Users, color: 'text-blue-600', sub: 'Registered Profiles' },
          { label: 'Outstanding Credit', value: fmtMoney(stats.totalDebtUsd), icon: Wallet, color: 'text-rose-600', sub: 'Cumulative (USD)' },
          { label: 'Cash-Only', value: stats.cashClients, icon: UserCheck, color: 'text-emerald-600', sub: 'Verified Accounts' },
          { label: 'Debt Accounts', value: stats.debtClients, icon: ArrowUpRight, color: 'text-amber-600', sub: 'Credit Eligible' },
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

      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Client Registry</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{filtered.length} results</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-60">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-10 h-10 border-2 rounded-xl text-xs font-bold" />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as DebtStatus | 'all')}>
              <SelectTrigger className="w-36 h-10 border-2 rounded-xl font-bold text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Debt">Debt Only</SelectItem>
                <SelectItem value="Cash">Cash Only</SelectItem>
                <SelectItem value="Unchecked">Unchecked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 w-20 text-[10px] font-black uppercase">ID</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Client</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Contact</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">USD</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">LBP</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">WA</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsQuery.isLoading && <SkeletonRows cols={8} />}
              {filtered.map(c => (
                <TableRow key={c.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6 font-mono text-[10px] font-black text-muted-foreground">#{c.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-black text-xs shrink-0">{c.full_name[0].toUpperCase()}</div>
                      <span className="font-black text-sm uppercase">{c.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-muted-foreground">
                      <Phone className="w-3 h-3" /> {c.mobile || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center"><DebtBadge status={c.debt_status} /></TableCell>
                  <TableCell className={`text-right font-mono text-sm font-black ${normalizeMoney(c.usd_balance, 'USD') < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {fmtMoney(normalizeMoney(c.usd_balance, 'USD'))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[10px] text-muted-foreground opacity-50">
                    {fmtMoney(normalizeMoney(c.lbp_balance, 'LBP'), 'LBP')}
                  </TableCell>
                  <TableCell className="text-center">
                    {c.mobile && c.mobile !== '0' ? (
                      <a href={`https://wa.me/${c.mobile.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700">
                        <MessageSquare className="w-4 h-4" />
                      </a>
                    ) : <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button variant="ghost" size="sm" className="h-8 px-4 opacity-0 group-hover:opacity-100 font-black text-[9px] uppercase" onClick={() => handleOpenEdit(c)}>EDIT</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-3xl border-2">
          <div className="p-8 bg-blue-600 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">{editingClient ? 'UPDATE PROFILE' : 'NEW CLIENT'}</h2>
            <p className="text-blue-100 text-sm">Maintain accurate customer records.</p>
          </div>
          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Client name..." className="h-12 border-2 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mobile</Label>
              <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+961..." className="h-12 border-2 font-mono" />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Debt Status</Label>
                <Select value={debtStatus} onValueChange={v => setDebtStatus(v as DebtStatus)}>
                  <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unchecked">Unchecked</SelectItem>
                    <SelectItem value="Cash">Cash Only</SelectItem>
                    <SelectItem value="Debt">Debt Eligible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">USD Balance</Label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-muted-foreground font-black text-xs">$</span>
                  <Input type="number" step="0.01" value={usdBalance} onChange={e => setUsdBalance(e.target.value)} className="h-12 pl-7 border-2 font-mono font-black text-lg" />
                </div>
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black text-lg rounded-2xl">
              {saveMutation.isPending ? 'SAVING...' : editingClient ? 'UPDATE CLIENT' : 'REGISTER CLIENT'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
