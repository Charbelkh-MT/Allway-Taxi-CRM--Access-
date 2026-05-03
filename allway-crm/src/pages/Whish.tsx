import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt, fmtMoney } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  Plus, 
  Search, 
  Filter, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  CreditCard, 
  Phone, 
  User, 
  FileText,
  Smartphone,
  Send,
  Download,
  AlertCircle
} from 'lucide-react'
import { UserBadge } from '@/components/shared/Badges'
import { Spinner } from '@/components/shared/Spinner'

const QK = ['whish_transactions']

const TX_TYPES: Record<string, { direction: 1 | -1; desc: string; icon: any }> = {
  'Whish to Whish': { direction: -1, desc: 'Client gives cash → you send from AllWay wallet to recipient.', icon: Send },
  'Receive USD':    { direction:  1, desc: "Client wallet sends USD to AllWay → you hand them cash.", icon: Download },
  'Send USD':       { direction: -1, desc: 'Client gives cash → you send USD from AllWay wallet to recipient.', icon: Send },
  'Top up LBP':     { direction: -1, desc: 'Client gives LBP cash → you top up their Whish wallet with LBP.', icon: Smartphone },
  'Withdrawal':     { direction:  1, desc: 'Client Whishes you money → you hand them equivalent cash.', icon: Wallet },
  'Alfa Dollars':   { direction: -1, desc: 'Client gives USD → you send Alfa telecom dollars to their account.', icon: Phone },
  'Touch Dollars':  { direction: -1, desc: 'Client gives USD → you send Touch telecom dollars to their account.', icon: Phone },
}

type RangeFilter = 'today' | 'week' | 'month' | 'all'

function startOf(range: RangeFilter): string | null {
  if (range === 'all') return null
  const d = new Date()
  if (range === 'today') { d.setHours(0, 0, 0, 0); return d.toISOString() }
  if (range === 'week')  { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.toISOString() }
  d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
}

function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

export default function Whish() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  const [type, setType] = useState(Object.keys(TX_TYPES)[0])
  const [client, setClient] = useState('')
  const [usd, setUsd] = useState('0')
  const [lbp, setLbp] = useState('0')
  const [commUsd, setCommUsd] = useState('0')
  const [commLbp, setCommLbp] = useState('0')
  const [note, setNote] = useState('')
  const [range, setRange] = useState<RangeFilter>('today')

  const txQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('whish_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const allTx = txQuery.data ?? []

  const todayStats = useMemo(() => {
    const start = todayStart()
    return allTx.filter(r => r.created_at >= start).reduce(
      (acc, r) => ({
        count:   acc.count + 1,
        usd:     acc.usd     + (parseFloat(r.amount_usd)    || 0),
        lbp:     acc.lbp     + (parseInt(r.amount_lbp)      || 0),
        commUsd: acc.commUsd + (parseFloat(r.commission_usd) || 0),
        commLbp: acc.commLbp + (parseInt(r.commission_lbp)  || 0),
      }),
      { count: 0, usd: 0, lbp: 0, commUsd: 0, commLbp: 0 },
    )
  }, [allTx])

  const walletBalance = useMemo(() =>
    allTx.reduce(
      (acc, r) => {
        const dir = TX_TYPES[r.transaction_type]?.direction ?? -1
        return {
          usd: acc.usd + dir * (parseFloat(r.amount_usd) || 0),
          lbp: acc.lbp + dir * (parseInt(r.amount_lbp)   || 0),
        }
      },
      { usd: 0, lbp: 0 },
    ),
  [allTx])

  const filteredTx = useMemo(() => {
    const from = startOf(range)
    return from ? allTx.filter(r => r.created_at >= from) : allTx
  }, [allTx, range])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!client.trim()) throw new Error('Client name is required')
      if (parseFloat(usd) <= 0 && parseInt(lbp) <= 0) throw new Error('Transaction amount is required')
      
      const { error } = await (supabase as any).from('whish_transactions').insert({
        transaction_type: type, 
        client_name: client.trim(),
        amount_usd: parseFloat(usd) || 0, 
        amount_lbp: parseInt(lbp) || 0,
        commission_usd: parseFloat(commUsd) || 0, 
        commission_lbp: parseInt(commLbp) || 0,
        note: note.trim(), 
        created_by: profile?.name ?? 'system', 
        station: profile?.station ?? '',
      })
      if (error) throw error
      // Warn if wallet would go negative after this outflow
      const dir = TX_TYPES[type]?.direction ?? -1
      if (dir === -1) {
        const newUsd = walletBalance.usd + dir * (parseFloat(usd) || 0)
        if (newUsd < 0) {
          toast.warning(`⚠ Wallet balance is now negative (${newUsd.toFixed(2)} USD). Verify your Whish account has sufficient funds.`)
        }
      }
      await log('whish_transaction', 'Whish', `${type} — ${client.trim()} — $${usd}`)
    },
    onSuccess: () => {
      toast.success('Whish transaction successfully recorded')
      void queryClient.invalidateQueries({ queryKey: QK })
      setClient(''); setUsd('0'); setLbp('0'); setCommUsd('0'); setCommLbp('0'); setNote('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save transaction'),
  })

  const currentTypeMeta = TX_TYPES[type]
  const CurrentIcon = currentTypeMeta?.icon || Wallet

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Official Whish Money Header — real logo + brand colors */}
      <div
        className="rounded-3xl text-white relative overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #EC174D 0%, #C1003A 60%, #410099 100%)' }}
      >
        {/* Decorative background circles matching Whish brand */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: '#7100FF' }} />
        <div className="absolute -bottom-20 -left-10 w-80 h-80 rounded-full opacity-10" style={{ background: '#EC174D' }} />

        {/* Top bar with official logo */}
        <div className="relative z-10 flex items-center justify-between px-8 pt-7 pb-5 border-b border-white/10">
          <div className="flex items-center gap-4">
            {/* Official Whish Money logo — white version on red bg */}
            <img
              src="/whish-logo.svg"
              alt="Whish Money"
              className="h-9 brightness-0 invert"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <div className="h-6 w-px bg-white/20" />
            <div>
              <p className="text-[8px] font-black uppercase tracking-[3px] text-white/60">AllWay Services</p>
              <p className="text-[9px] text-white/80 font-medium">Official Whish Agent</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/60 font-bold mb-0.5">Today's transactions</p>
            <p className="text-5xl font-black tabular-nums">{todayStats.count}</p>
            <p className="text-[10px] text-white/60 mt-0.5">{profile?.station}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border-t border-white/10">
          {[
            { label: 'USD Volume', value: fmtMoney(todayStats.usd, 'USD'), icon: TrendingUp, accent: false },
            { label: 'LBP Volume', value: fmtMoney(todayStats.lbp, 'LBP'), icon: Activity,  accent: false },
            { label: 'Commission USD', value: fmtMoney(todayStats.commUsd, 'USD'), icon: DollarSign, accent: true },
            { label: 'Commission LBP', value: fmtMoney(todayStats.commLbp, 'LBP'), icon: DollarSign, accent: true },
          ].map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="bg-black/10 backdrop-blur-sm px-6 py-5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-white/50" />
                <p className="text-[9px] font-black uppercase tracking-[2px] text-white/60">{label}</p>
              </div>
              <p className={`text-lg font-mono font-black ${accent ? 'text-yellow-300' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Wallet Balance — slim strip inside header */}
        <div className="relative z-10 grid grid-cols-2 gap-px bg-white/10 border-t border-white/10">
          <div className="bg-black/20 px-6 py-3 flex items-center gap-3">
            <ArrowUpRight className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[9px] font-black uppercase tracking-[2px] text-white/50">Wallet USD</span>
            <span className={`ml-auto font-mono font-black text-sm ${walletBalance.usd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {walletBalance.usd >= 0 ? '+' : ''}{fmtMoney(walletBalance.usd, 'USD')}
            </span>
          </div>
          <div className="bg-black/20 px-6 py-3 flex items-center gap-3">
            <ArrowDownLeft className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[9px] font-black uppercase tracking-[2px] text-white/50">Wallet LBP</span>
            <span className={`ml-auto font-mono font-black text-sm ${walletBalance.lbp >= 0 ? 'text-indigo-200' : 'text-rose-300'}`}>
              {walletBalance.lbp >= 0 ? '+' : ''}{fmtMoney(walletBalance.lbp, 'LBP')}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Log Transaction Section */}
        <Card className="border-2 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-secondary/30 pb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-600 text-white rounded-lg">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight">Log Transaction</CardTitle>
                <CardDescription>Record a new transfer or top-up service.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-12 border-2 focus:ring-rose-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TX_TYPES).map(([key, meta]) => {
                      const Icon = meta.icon
                      return (
                        <SelectItem key={key} value={key} className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-md ${meta.direction === 1 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-bold">{key}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {currentTypeMeta && (
                  <div className="p-4 bg-secondary/50 rounded-2xl flex gap-3 items-start border border-secondary transition-all">
                    <AlertCircle className={`w-5 h-5 mt-0.5 shrink-0 ${currentTypeMeta.direction === 1 ? 'text-emerald-600' : 'text-rose-600'}`} />
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${currentTypeMeta.direction === 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {currentTypeMeta.direction === 1 ? 'Funds IN (Balance Up)' : 'Funds OUT (Balance Down)'}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed italic">{currentTypeMeta.desc}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client Name / Recipient</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                  <Input value={client} onChange={e => setClient(e.target.value)} placeholder="Enter full name..." className="h-12 pl-10 border-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount USD</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                    <Input type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} className="h-12 pl-10 border-2 font-mono font-bold text-lg" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount LBP</Label>
                  <Input type="number" value={lbp} onChange={e => setLbp(e.target.value)} className="h-12 border-2 font-mono font-bold text-lg" />
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid grid-cols-2 gap-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-amber-700">Comm. USD</Label>
                  <Input type="number" step="0.01" value={commUsd} onChange={e => setCommUsd(e.target.value)} className="h-11 border-amber-200 focus:ring-amber-500 font-mono font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-amber-700">Comm. LBP</Label>
                  <Input type="number" value={commLbp} onChange={e => setCommLbp(e.target.value)} className="h-11 border-amber-200 focus:ring-amber-500 font-mono font-bold" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transaction Note</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                  <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Reference # or additional info..." className="h-12 pl-10 border-2" />
                </div>
              </div>
            </div>

            <Button className="w-full h-14 text-lg font-bold text-white shadow-xl shadow-rose-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all" style={{ background: 'linear-gradient(90deg, #EC174D 0%, #C1003A 100%)' }}
              onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />Processing...</> : 'Complete Transaction'}
            </Button>
            
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest text-center">
              All transactions are audit-logged with station ID and agent name
            </p>
          </CardContent>
        </Card>

        {/* Transaction History Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-bold tracking-tight text-lg uppercase">Transaction Log</h3>
            </div>
            <Select value={range} onValueChange={v => setRange(v as RangeFilter)}>
              <SelectTrigger className="w-[140px] h-9 text-xs font-bold shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">Full History</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-3xl border-2 shadow-sm overflow-hidden bg-background">
            <div className="max-h-[700px] overflow-auto">
              <Table className="aw-table">
                <TableHeader className="bg-secondary/40 sticky top-0 z-10 backdrop-blur-md">
                  <TableRow>
                    <TableHead className="font-bold text-[10px] uppercase">Service / Client</TableHead>
                    <TableHead className="text-right font-bold text-[10px] uppercase">Amount</TableHead>
                    <TableHead className="text-right font-bold text-[10px] uppercase">Commission</TableHead>
                    <TableHead className="text-center font-bold text-[10px] uppercase">Agent</TableHead>
                    <TableHead className="text-right font-bold text-[10px] uppercase">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txQuery.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">Fetching ledger entries...</TableCell></TableRow>}
                  {!txQuery.isLoading && filteredTx.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No records found for this period.</TableCell></TableRow>}
                  {filteredTx.map((r: any) => {
                    const meta = TX_TYPES[r.transaction_type]
                    const dir = meta?.direction ?? -1
                    const Icon = meta?.icon || Wallet
                    const cUsd = parseFloat(r.commission_usd) || 0
                    const cLbp = parseInt(r.commission_lbp) || 0
                    
                    return (
                      <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-md ${dir === 1 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <span className="text-xs font-black tracking-tight uppercase leading-none">{r.transaction_type}</span>
                            </div>
                            <span className="text-sm font-bold text-muted-foreground pl-7">{r.client_name || 'Walk-in'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            {parseFloat(r.amount_usd) > 0 && <span className="font-mono text-xs font-black text-foreground">{fmtMoney(parseFloat(r.amount_usd), 'USD')}</span>}
                            {parseInt(r.amount_lbp) > 0 && <span className="font-mono text-[10px] font-bold text-muted-foreground">{fmtMoney(parseInt(r.amount_lbp), 'LBP')}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            {cUsd > 0 && <span className="text-[10px] font-mono font-black text-amber-600">{fmtMoney(cUsd, 'USD')}</span>}
                            {cLbp > 0 && <span className="text-[9px] font-mono font-bold text-amber-500">{fmtMoney(cLbp, 'LBP')}</span>}
                            {!cUsd && !cLbp && <span className="text-muted-foreground text-[10px]">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <UserBadge name={r.created_by} />
                          {r.station && <p className="text-[8px] text-muted-foreground mt-0.5 uppercase tracking-tighter">{r.station}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end opacity-60 group-hover:opacity-100 transition-opacity">
                            <span className="font-mono text-[10px] font-bold text-foreground">{fmt(r.created_at).split(' ')[1]}</span>
                            <span className="text-[8px] uppercase font-medium text-muted-foreground leading-none">{fmt(r.created_at).split(' ')[0]}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
