import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, USD_RATE } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { 
  Calculator, 
  History, 
  DollarSign, 
  TrendingUp, 
  Wallet, 
  ArrowRightLeft, 
  CheckCircle2, 
  FileText, 
  Building2, 
  User, 
  ChevronRight,
  Printer,
  Copy,
  PlusCircle,
  Coins,
  CreditCard,
  Smartphone,
  Banknote,
  XCircle
} from 'lucide-react'

const QK = ['pnl_entries']

export default function DailyBalance() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  // USD Section
  const [usdCms, setUsdCms] = useState('0')
  const [usdWhish, setUsdWhish] = useState('0')
  const [usdCash, setUsdCash] = useState('0')
  const [usdt, setUsdt] = useState('0')
  const [alfa, setAlfa] = useState('0')
  const [touch, setTouch] = useState('0')

  // LBP Section
  const [lbpCms, setLbpCms] = useState('0')
  const [lbpWhish, setLbpWhish] = useState('0')
  const [lbpCash, setLbpCash] = useState('0')

  // Commission
  const [commUsd, setCommUsd] = useState('0')
  const [commLbp, setCommLbp] = useState('0')

  const [note, setNote] = useState('')

  const pnlQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('pnl_entries').select('*').order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      return data ?? []
    }
  })

  const totals = useMemo(() => {
    const u_cms = parseFloat(usdCms) || 0
    const u_whish = parseFloat(usdWhish) || 0
    const u_cash = parseFloat(usdCash) || 0
    const u_usdt = parseFloat(usdt) || 0
    const u_alfa = parseFloat(alfa) || 0
    const u_touch = parseFloat(touch) || 0

    const l_cms = parseFloat(lbpCms) || 0
    const l_whish = parseFloat(lbpWhish) || 0
    const l_cash = parseFloat(lbpCash) || 0

    // Using 90,000 as the standard rate for reconciliation
    const totalUsd = u_cms + u_whish + u_cash + u_usdt + u_alfa + u_touch + (l_cms + l_whish + l_cash) / USD_RATE
    
    return {
      totalUsd,
      shiftProfit: totalUsd * 0.05, 
      dayProfit: totalUsd * 0.08,   
    }
  }, [usdCms, usdWhish, usdCash, usdt, alfa, touch, lbpCms, lbpWhish, lbpCash, commUsd, commLbp])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        entry_date: new Date().toISOString().split('T')[0],
        usd_cms: parseFloat(usdCms) || 0,
        usd_whish: parseFloat(usdWhish) || 0,
        usd_cash: parseFloat(usdCash) || 0,
        usdt: parseFloat(usdt) || 0,
        alfa_dollars: parseFloat(alfa) || 0,
        touch_dollars: parseFloat(touch) || 0,
        lbp_cms: parseFloat(lbpCms) || 0,
        lbp_whish: parseFloat(lbpWhish) || 0,
        lbp_cash: parseFloat(lbpCash) || 0,
        commission_usd: parseFloat(commUsd) || 0,
        commission_lbp: parseFloat(commLbp) || 0,
        note,
        total_usd: totals.totalUsd,
        shift_profit: totals.shiftProfit,
        day_profit: totals.dayProfit,
        created_by: profile?.name ?? 'system',
        station: profile?.station ?? '',
      }

      const { error } = await (supabase as any).from('pnl_entries').insert(payload)
      if (error) throw error
      await log('pnl_entry_added', 'Daily Balance', `Reconciliation report saved: ${fmtMoney(totals.totalUsd)}`)
    },
    onSuccess: () => {
      toast.success('Daily balance entry saved successfully')
      void queryClient.invalidateQueries({ queryKey: QK })
      setUsdCms('0'); setUsdWhish('0'); setUsdCash('0'); setUsdt('0'); setAlfa('0'); setTouch('0')
      setLbpCms('0'); setLbpWhish('0'); setLbpCash('0')
      setCommUsd('0'); setCommLbp('0'); setNote('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to archive report')
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 px-4 sm:px-6">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20">
            <Calculator className="w-8 h-8" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-foreground uppercase italic">Daily Balance</h1>
            <p className="text-muted-foreground text-sm font-medium">Global financial reconciliation and PNL tracking.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-11 px-6 border-2 font-bold hover:bg-secondary transition-all flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Save & Copy
          </Button>
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="h-11 px-6 bg-amber-500/10 border-amber-500/20 text-amber-700 font-bold hover:bg-amber-500/20 flex items-center gap-2"
            variant="outline"
          >
            <History className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Entry'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* USD Section */}
          <Card className="border-2 shadow-sm rounded-3xl overflow-hidden bg-background">
            <CardHeader className="bg-secondary/30 pb-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg shadow-md">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black tracking-tight uppercase">USD Global Assets</CardTitle>
                    <CardDescription>All physical and digital USD holdings.</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 font-bold px-3 py-1">USD BASE</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {[
                  { label: 'CMS Wallet (USD)', state: usdCms, setState: setUsdCms, icon: Wallet },
                  { label: 'Whish Balance (USD)', state: usdWhish, setState: setUsdWhish, icon: Smartphone },
                  { label: 'Physical Cash (USD)', state: usdCash, setState: setUsdCash, icon: Banknote },
                  { label: 'Tether (USDT)', state: usdt, setState: setUsdt, icon: Coins },
                  { label: 'Alfa Telecom ($)', state: alfa, setState: setAlfa, icon: CreditCard },
                  { label: 'Touch Telecom ($)', state: touch, setState: setTouch, icon: CreditCard },
                ].map(({ label, state, setState, icon: Icon }) => (
                  <div key={label} className="space-y-2 group">
                    <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1 tracking-widest flex items-center gap-1.5 group-hover:text-blue-600 transition-colors">
                      <Icon className="w-3 h-3" /> {label}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-muted-foreground font-mono font-bold">$</span>
                      <Input 
                        type="number" 
                        value={state} 
                        onChange={e => setState(e.target.value)} 
                        className="h-12 pl-8 bg-secondary/30 border-2 font-mono font-bold text-lg focus-visible:ring-blue-600 focus-visible:border-blue-600" 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* LBP Section */}
          <Card className="border-2 shadow-sm rounded-3xl overflow-hidden bg-background">
            <CardHeader className="bg-secondary/30 pb-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-md">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black tracking-tight uppercase">LBP Global Assets</CardTitle>
                    <CardDescription>Physical and digital Lebanese Pound holdings.</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="bg-white border-emerald-200 text-emerald-700 font-bold px-3 py-1">LBP LIQUIDITY</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { label: 'CMS Wallet (LBP)', state: lbpCms, setState: setLbpCms },
                  { label: 'Whish Balance (LBP)', state: lbpWhish, setState: setLbpWhish },
                  { label: 'Physical Cash (LBP)', state: lbpCash, setState: setLbpCash },
                ].map(({ label, state, setState }) => (
                  <div key={label} className="space-y-2 group">
                    <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1 tracking-widest group-hover:text-emerald-600 transition-colors">
                      {label}
                    </Label>
                    <div className="relative">
                      <Input 
                        type="number" 
                        value={state} 
                        onChange={e => setState(e.target.value)} 
                        className="h-12 bg-secondary/30 border-2 font-mono font-bold text-lg focus-visible:ring-emerald-600 focus-visible:border-emerald-600 text-right pr-4" 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary Scorecard */}
        <div className="space-y-6">
          <Card className="border-2 border-amber-500/30 bg-background shadow-2xl rounded-3xl overflow-hidden sticky top-6">
            <CardHeader className="bg-amber-500/10 border-b border-amber-500/20 py-6 text-center">
              <CardTitle className="text-xs font-black uppercase tracking-[3px] text-amber-700">Financial Summary</CardTitle>
              <CardDescription className="font-bold text-amber-600/80">Real-time Reconciliation Report</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-1 text-center py-4 bg-amber-500/5 rounded-2xl border-2 border-dashed border-amber-500/20">
                <p className="text-[10px] uppercase font-black text-amber-700 tracking-widest leading-none mb-2">Total Combined Balance (USD)</p>
                <p className="text-5xl font-display font-black tracking-tighter text-amber-600 italic">
                  {fmtMoney(totals.totalUsd)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 font-mono text-[9px]">EXCHANGE: 90,000 LBP</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 text-center group hover:bg-emerald-500/15 transition-all">
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-emerald-600" />
                  <p className="text-[10px] uppercase font-black text-emerald-700 mb-1 leading-none tracking-tighter">Shift Profit</p>
                  <p className="text-xl font-mono font-black text-emerald-600">{fmtMoney(totals.shiftProfit)}</p>
                </div>
                <div className="bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20 text-center group hover:bg-indigo-500/15 transition-all">
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-indigo-600" />
                  <p className="text-[10px] uppercase font-black text-indigo-700 mb-1 leading-none tracking-tighter">Day Profit</p>
                  <p className="text-xl font-mono font-black text-indigo-600">{fmtMoney(totals.dayProfit)}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1">LBP Comm.</Label>
                    <Input type="number" value={commLbp} onChange={e => setCommLbp(e.target.value)} className="h-11 bg-secondary/40 border-2 font-mono font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-muted-foreground ml-1">USD Comm.</Label>
                    <Input type="number" value={commUsd} onChange={e => setCommUsd(e.target.value)} className="h-11 bg-secondary/40 border-2 font-mono font-bold" />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Internal Note
                  </Label>
                  <Input 
                    value={note} 
                    onChange={e => setNote(e.target.value)} 
                    placeholder="e.g. Closing night shift..." 
                    className="h-11 bg-secondary/30 border-2 font-medium"
                  />
                </div>
              </div>

              <Button 
                className="w-full h-16 bg-amber-600 hover:bg-amber-700 text-white font-display font-black text-xl shadow-2xl shadow-amber-600/30 transition-all active:scale-[0.98] rounded-2xl uppercase tracking-widest italic"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Processing...' : 'Save & Post Report'}
              </Button>
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <Button variant="ghost" className="h-10 text-xs font-bold text-muted-foreground hover:bg-secondary flex items-center gap-2" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" /> Print Sheet
                </Button>
                <Button variant="ghost" className="h-10 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2" onClick={() => navigate('/')}>
                  <XCircle className="w-4 h-4" /> Close Panel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History Ledger Section */}
      <div className="space-y-4 mt-12">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-black uppercase tracking-widest text-muted-foreground">Historical Reconciliation Ledger</h2>
          </div>
          <Badge variant="secondary" className="font-bold uppercase tracking-widest text-[10px] px-3">{pnlQuery.data?.length || 0} RECORDS</Badge>
        </div>
        
        <div className="rounded-3xl border-2 shadow-sm bg-background overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="text-[10px] font-black uppercase py-4">Reconciliation Date</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Origin Station</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Supervisor</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Global USD Balance</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase pr-8">Daily Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnlQuery.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">Fetching archive records...</TableCell></TableRow>}
              {!pnlQuery.isLoading && (pnlQuery.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No reconciliation reports found.</TableCell></TableRow>}
              {(pnlQuery.data ?? []).map((entry: any) => (
                <TableRow key={entry.id} className="hover:bg-secondary/5 transition-colors group">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <span className="font-mono text-xs font-bold text-foreground">
                        {format(new Date(entry.created_at), 'dd MMM yyyy · HH:mm')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{entry.station || 'ROOT'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <User className="w-3.5 h-3.5 text-primary/50" />
                      <span className="text-xs font-bold">{entry.created_by}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-sm text-foreground">
                    {fmtMoney(entry.total_usd)}
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-mono font-black text-sm">+{fmtMoney(entry.day_profit)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
