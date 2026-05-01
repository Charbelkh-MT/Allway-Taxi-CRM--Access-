import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { 
  ShoppingBag, 
  Users, 
  TrendingUp, 
  AlertCircle, 
  Receipt, 
  Package, 
  Plus, 
  ArrowRight, 
  History, 
  CreditCard, 
  Smartphone, 
  Clock, 
  ChevronRight,
  ShieldCheck,
  Zap,
  Building2,
  Calendar,
  XCircle,
  FileText,
  DollarSign,
  LayoutGrid,
  Activity,
  ArrowUpRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { fmtMoney, fmt, normalizeMoney, LBP_MIN, sendWhatsApp, sendEmail, buildDailyWhatsApp, buildDailyReportHTML, type DailyReportData, type DailyReportFullData } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Invoice, AuditLog, Shift } from '@/types/database'

interface Metrics {
  todaySales: number
  totalClients: number
  totalProducts: number
  pendingExpenses: number
  openReceivables: number
  lowStockCount: number
  suspiciousCount: number
}

export default function Dashboard() {
  const { profile } = useAuth()
  const role = useRole()
  const isAdmin = role === 'admin' || role === 'supervisor'
  const queryClient = useQueryClient()
  const [confirmCloseDayOpen, setConfirmCloseDayOpen] = useState(false)
  const { log } = useAuditLog()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([])
  const activeShiftQuery = useQuery({
    queryKey: ['shift', 'active', profile?.name],
    queryFn: async () => {
      if (!profile?.name) return null
      const { data } = await supabase.from('shifts').select('*').eq('user_name', profile.name).eq('status', 'open').maybeSingle()
      return data ?? null
    },
    enabled: !!profile?.name,
  })
  const activeShift = activeShiftQuery.data ?? null
  const [loading, setLoading] = useState(true)

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [startUsd, setStartUsd] = useState('0')
  const [startLbp, setStartLbp] = useState('0')
  const [isStarting, setIsStarting] = useState(false)
  const [elapsed, setElapsed] = useState('00:00:00')

  useEffect(() => {
    if (!activeShift?.opened_at) { setElapsed('00:00:00'); return }
    function tick() {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(activeShift!.opened_at!).getTime()) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeShift?.opened_at])

  useEffect(() => {
    async function load() {
      if (!profile) return
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const station = profile.station ?? ''

      const [
        todayInvsRes,
        clientCountRes,
        productCountRes,
        pendingExpensesRes,
        openReceivablesRes,
        productsRes,
        invoicesRes,
        logsRes,
      ] = await Promise.all([
        supabase.from('invoices').select('total_usd,total_lbp').eq('station', station).gte('created_at', todayStart.toISOString()).eq('status', 'saved'),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('station', station).eq('status', 'pending'),
        supabase.from('receivables').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('products').select('cost,selling,quantity').eq('active', true),
        supabase.from('invoices').select('*').eq('station', station).order('created_at', { ascending: false }).limit(10),
        supabase.from('audit_log').select('*').eq('station', station).order('created_at', { ascending: false }).limit(10),
      ])

      const todaySales = ((todayInvsRes.data ?? []) as any[]).reduce((sum, row) => {
        const usd = normalizeMoney(row.total_usd, 'USD')
        const lbp = normalizeMoney(row.total_lbp, 'LBP')
        return sum + (usd > 0 ? usd : lbp / 90_000)
      }, 0)

      setMetrics({
        todaySales,
        totalClients: clientCountRes.count ?? 0,
        totalProducts: productCountRes.count ?? 0,
        pendingExpenses: pendingExpensesRes.count ?? 0,
        openReceivables: openReceivablesRes.count ?? 0,
        lowStockCount: (productsRes.data ?? []).filter((p: any) => p.quantity <= 2).length,
        suspiciousCount: (productsRes.data ?? []).filter((p: any) => p.cost > p.selling).length,
      })
      setRecentInvoices(invoicesRes.data ?? [])
      setRecentLogs(logsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [profile])

  async function handleStartShift() {
    if (!profile) return
    setIsStarting(true)
    try {
      const { data, error } = await (supabase as any).from('shifts').insert({
        user_name: profile.name,
        station: profile.station || 'Default',
        expected_cash_usd: parseFloat(startUsd) || 0,
        status: 'open',
        opened_at: new Date().toISOString()
      }).select().single()
      if (error) throw error
      queryClient.setQueryData(['shift', 'active', profile.name], data); setShiftDialogOpen(false); toast.success('Shift started!')
      await log('shift_started', 'Dashboard', `Started shift at ${profile.station}`)
    } catch (e: any) { toast.error(e.message || 'Failed') } finally { setIsStarting(false) }
  }

  const infoQuery = { data: null as any }  // settings — loaded lazily inside mutation

  const closeDayMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) throw new Error('Supervisor clearance required')
      const start = new Date(); start.setHours(0,0,0,0)
      const startISO = start.toISOString()

      // 1. Close any still-open shifts
      await (supabase as any).from('shifts').update({
        status: 'closed', closed_at: new Date().toISOString(),
      }).gte('opened_at', startISO).eq('status', 'open')

      // 2. Gather today's full data for reports
      const [invRes, expRes, whishRes, shiftRes] = await Promise.all([
        (supabase as any).from('invoices').select('*').eq('status','saved').gte('created_at', startISO),
        (supabase as any).from('expenses').select('*').gte('created_at', startISO),
        (supabase as any).from('whish_transactions').select('*').gte('created_at', startISO),
        supabase.from('shifts').select('*').gte('opened_at', startISO),
      ])
      const invoices = (invRes.data ?? []) as any[]
      const expenses = (expRes.data ?? []) as any[]
      const whish    = (whishRes.data ?? []) as any[]
      const shifts   = (shiftRes.data ?? []) as any[]

      const invIds = invoices.map((r: any) => r.id)
      const itemsD = invIds.length > 0
        ? (((await (supabase as any).from('invoice_items').select('product_name,quantity').in('invoice_id', invIds)).data ?? []) as any[])
        : []
      const pt: Record<string,number> = {}
      itemsD.forEach((i: any) => { pt[i.product_name||'?'] = (pt[i.product_name||'?']??0)+(i.quantity||0) })
      const topProducts = Object.entries(pt).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,qty]) => ({name,qty}))

      const totalSalesUsd = invoices.reduce((s: number, r: any) => s + Math.max(0, normalizeMoney(parseFloat(r.total_usd||0),'USD')), 0)
      const totalSalesLbp = invoices.reduce((s: number, r: any) => { const v = normalizeMoney(parseFloat(r.total_lbp||0),'LBP'); return s + (v > LBP_MIN ? v : 0) }, 0)
      const totalExp      = expenses.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd||0),'USD'), 0)
      const whishVol      = whish.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd||0),'USD'), 0)
      const whishComm     = whish.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.commission_usd||0),'USD'), 0)
      const flaggedCount  = shifts.filter((s: any) => s.status === 'flagged').length
      const dateStr       = new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Beirut' })

      const reportData: DailyReportData = {
        date: dateStr, totalSalesUsd, totalSalesLbp, invoiceCount: invoices.length,
        expenseTotal: totalExp, whishVolume: whishVol, whishCommission: whishComm,
        shiftCount: shifts.length, flaggedCount, topProducts,
      }

      // 3. Send notifications if configured
      const { data: infoRow } = await (supabase as any).from('tblInformation').select('*').limit(1).single().catch(() => ({ data: null }))
      const phone     = infoRow?.OwnerWhatsapp  || infoRow?.owner_whatsapp  || ''
      const legacyKey = infoRow?.CallMeBotApiKey || infoRow?.callmebot_api_key || ''
      const ownerEml  = infoRow?.OwnerEmail     || infoRow?.owner_email     || ''
      const dailyWaOn    = infoRow?.DailyReportEnabled  ?? infoRow?.daily_report_enabled  ?? false
      const dailyEmailOn = infoRow?.DailyEmailEnabled   ?? infoRow?.daily_email_enabled   ?? false

      if (phone && dailyWaOn)
        await sendWhatsApp(phone, legacyKey, buildDailyWhatsApp(reportData))
      if (dailyEmailOn && ownerEml) {
        const fullData: DailyReportFullData = { ...reportData, invoices, expenses, whishTransactions: whish, shifts }
        await sendEmail(ownerEml, `AllWay Daily Report — ${dateStr}`, buildDailyReportHTML(fullData))
      }

      await log('day_closed', 'Dashboard', `Day closed by ${profile?.name} — ${invoices.length} invoices, $${totalSalesUsd.toFixed(2)}`)
    },
    onSuccess: () => {
      toast.success('Day closed — analytics compiled, notifications sent')
      void queryClient.invalidateQueries()
      setConfirmCloseDayOpen(false)
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : 'Failed to close day'); setConfirmCloseDayOpen(false) },
  })

  if (loading) return <div className="h-screen flex items-center justify-center"><Zap className="w-8 h-8 text-amber-500 animate-pulse" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      
      {/* Header & Status Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_orange]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Operational Hub</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic">
            WELCOME, {profile?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {profile?.station || 'Main Office'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!activeShift ? (
            <Button onClick={() => setShiftDialogOpen(true)} className="h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 rounded-2xl shadow-lg shadow-amber-500/20">
              <Zap className="w-4 h-4 mr-2" /> OPEN SESSION
            </Button>
          ) : (
            <Card className="bg-emerald-500/5 border-emerald-500/20 shadow-none hover:bg-emerald-500/10 transition-all cursor-pointer" onClick={() => navigate('/shift')}>
              <CardContent className="px-6 py-3 flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Session Active</p>
                  <p className="text-[10px] text-emerald-600 opacity-70">Started {activeShift.opened_at ? new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                  <p className="font-mono font-black text-lg text-emerald-900 tabular-nums leading-tight">{elapsed}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400 ml-2" />
              </CardContent>
            </Card>
          )}
        {isAdmin && (
          <button
            onClick={() => setConfirmCloseDayOpen(true)}
            className="h-12 px-6 rounded-2xl border-2 border-destructive text-destructive font-bold hover:bg-destructive hover:text-white transition-all flex items-center gap-2 text-sm"
          >
            <XCircle className="w-4 h-4" />
            Close Day
          </button>
        )}
        </div>
      </div>

      {/* Close Day Confirmation Dialog */}
      <Dialog open={confirmCloseDayOpen} onOpenChange={setConfirmCloseDayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Close Day</DialogTitle>
            <DialogDescription>
              This will compile today's full analytics, close any open shifts, and send the daily report
              to the owner via WhatsApp and email (if configured in Settings).
              This action is logged and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-secondary p-4 space-y-1.5 text-sm">
            <p className="font-semibold text-foreground">What happens:</p>
            <p className="text-muted-foreground">✓ All open shifts are marked closed</p>
            <p className="text-muted-foreground">✓ Daily WhatsApp summary sent to owner</p>
            <p className="text-muted-foreground">✓ Full HTML email report sent (if enabled)</p>
            <p className="text-muted-foreground">✓ Logged in Audit Log</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCloseDayOpen(false)} disabled={closeDayMutation.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => closeDayMutation.mutate()} disabled={closeDayMutation.isPending}>
              {closeDayMutation.isPending ? 'Compiling & sending...' : 'Yes, Close Day'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decluttered Metrics Command Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmtMoney(metrics?.todaySales || 0), icon: TrendingUp, color: 'text-emerald-600', sub: 'Today (USD)' },
          { label: 'Active Clients', value: metrics?.totalClients || 0, icon: Users, color: 'text-indigo-600', sub: 'Global Directory' },
          { label: 'Stock Items', value: metrics?.totalProducts || 0, icon: Package, color: 'text-slate-700', sub: 'In Catalog' },
          { label: 'Pending Debt', value: metrics?.openReceivables || 0, icon: CreditCard, color: 'text-amber-600', sub: 'Awaiting Collection' },
        ].map((m) => (
          <div key={m.label} className="p-6 bg-background border-2 rounded-3xl hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-xl bg-secondary`}>
                <m.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{m.label}</p>
            <p className={`text-2xl font-black tracking-tight ${m.color}`}>{m.value}</p>
            <p className="text-[9px] font-medium text-muted-foreground mt-1 opacity-60">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Quick Actions & Alerts */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Alerts Section - Only shows if active */}
          {(metrics && (metrics.pendingExpenses > 0 || metrics.lowStockCount > 0 || metrics.suspiciousCount > 0)) && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Priority Alerts</p>
              <div className="space-y-2">
                {metrics.pendingExpenses > 0 && (
                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-200">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold text-amber-800">{metrics.pendingExpenses} Expenses Pending</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[9px] font-black uppercase text-amber-700 hover:bg-amber-100" onClick={() => navigate('/expenses')}>Review</Button>
                  </div>
                )}
                {metrics.lowStockCount > 0 && (
                  <div className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-200">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-bold text-rose-800">{metrics.lowStockCount} Items Low on Stock</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[9px] font-black uppercase text-rose-700 hover:bg-rose-100" onClick={() => navigate('/inventory')}>Restock</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clean Quick Actions */}
          <Card className="rounded-3xl border-2 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Quick Launch</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'New Sale', icon: Plus, path: '/sales', color: 'bg-indigo-600' },
                { label: 'Whish', icon: Smartphone, path: '/whish', color: 'bg-rose-600' },
                { label: 'Expense', icon: Receipt, path: '/expenses', color: 'bg-slate-800' },
                { label: 'Balance', icon: Calculator, path: '/daily-balance', color: 'bg-amber-600' },
              ].map((btn) => (
                <Button 
                  key={btn.label} 
                  variant="secondary" 
                  className="h-14 rounded-2xl flex flex-col items-center justify-center gap-1 group hover:bg-primary/5 hover:text-primary transition-all"
                  onClick={() => navigate(btn.path)}
                >
                  <btn.icon className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                  <span className="text-[9px] font-black uppercase tracking-tighter">{btn.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Unified Activity Center */}
        <div className="lg:col-span-8">
          <Tabs defaultValue="invoices" className="w-full">
            <div className="flex items-center justify-between mb-4 px-2">
              <TabsList className="bg-secondary/50 p-1 rounded-2xl">
                <TabsTrigger value="invoices" className="rounded-xl px-6 font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <FileText className="w-3.5 h-3.5 mr-2" /> Recent Sales
                </TabsTrigger>
                <TabsTrigger value="activity" className="rounded-xl px-6 font-bold text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Activity className="w-3.5 h-3.5 mr-2" /> System Feed
                </TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest opacity-50 hover:opacity-100" onClick={() => navigate('/sales')}>
                View Ledger <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            <TabsContent value="invoices" className="mt-0">
              <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
                <div className="divide-y divide-border/50">
                  {recentInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors group cursor-pointer" onClick={() => navigate('/sales')}>
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold tracking-tight uppercase leading-none mb-1">{inv.client_name || 'Walk-in'}</p>
                          <p className="text-[9px] font-mono text-muted-foreground uppercase opacity-60">{fmt(inv.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={`text-[9px] font-black uppercase tracking-tighter ${inv.status === 'saved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                          {inv.status}
                        </Badge>
                        <p className="font-mono text-sm font-black text-foreground">
                          {normalizeMoney(inv.total_lbp, 'LBP') > 0 ? fmtMoney(normalizeMoney(inv.total_lbp, 'LBP'), 'LBP') : fmtMoney(normalizeMoney(inv.total_usd, 'USD'), 'USD')}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentInvoices.length === 0 && (
                    <div className="py-20 text-center opacity-30"><LayoutGrid className="w-10 h-10 mx-auto mb-4" /><p className="text-xs font-black uppercase tracking-widest">No Sales Found</p></div>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
                <div className="p-6 space-y-6">
                  {recentLogs.map((log, idx) => (
                    <div key={log.id} className="relative pl-6">
                      {idx !== recentLogs.length - 1 && <div className="absolute left-1.5 top-5 bottom-[-1.5rem] w-[2px] bg-secondary" />}
                      <div className="absolute left-0 top-1 w-3 h-3 rounded-full border-2 border-amber-500 bg-background shadow-[0_0_8px_rgba(245,158,11,0.2)]" />
                      <div>
                        <p className="text-[11px] font-bold tracking-tight text-foreground">{log.detail || log.action}</p>
                        <div className="flex items-center gap-2 mt-1 opacity-50">
                          <span className="text-[9px] font-black uppercase tracking-widest">{log.user_name}</span>
                          <span className="font-mono text-[9px]">{fmt(log.created_at).split(' ')[1]}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentLogs.length === 0 && (
                    <div className="py-20 text-center opacity-30"><History className="w-10 h-10 mx-auto mb-4" /><p className="text-xs font-black uppercase tracking-widest">Feed Empty</p></div>
                  )}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-3xl border-2">
          <div className="p-8 bg-amber-500 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">OPEN SESSION</h2>
            <p className="text-amber-100 text-sm font-medium">Initialize your starting cash balance.</p>
          </div>
          <div className="p-8 space-y-6 bg-background">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Starting USD</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input type="number" value={startUsd} onChange={e => setStartUsd(e.target.value)} placeholder="0.00" className="h-12 pl-10 border-2 font-mono font-bold text-lg" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Starting LBP</Label>
                <Input type="number" value={startLbp} onChange={e => setStartLbp(e.target.value)} placeholder="0" className="h-12 border-2 font-mono font-bold text-lg" />
              </div>
            </div>
            <Button className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-amber-500/20" onClick={handleStartShift} disabled={isStarting}>
              {isStarting ? 'INITIALIZING...' : 'START SHIFT'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'MORNING'
  if (h < 17) return 'AFTERNOON'
  return 'EVENING'
}

function Calculator(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" />
    </svg>
  )
}
