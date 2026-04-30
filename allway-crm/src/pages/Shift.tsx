import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Clock, 
  Play, 
  StopCircle, 
  BarChart3, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  FileText, 
  Wallet,
  MessageSquare,
  ArrowRight,
  User
} from 'lucide-react'
import type { Shift } from '@/types/database'

// HTML-escape user-provided data before inserting into report template
function escHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}


function todayStart() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString() }

export default function ShiftPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isAdmin = role === 'admin' || role === 'supervisor'

  const [counted, setCounted] = useState('')
  const [shiftNote, setShiftNote] = useState('')
  const [reconSales, setReconSales] = useState(0)

  const activeShiftQuery = useQuery({
    queryKey: ['shift', 'active', profile?.name],
    queryFn: async (): Promise<Shift | null> => {
      const { data, error } = await supabase.from('shifts').select('*').eq('user_name', profile?.name ?? '').eq('status', 'open').order('opened_at', { ascending: false }).limit(1)
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!profile?.name,
  })

  const stationQuery = useQuery({
    queryKey: ['shifts', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shifts').select('*').gte('opened_at', todayStart()).order('opened_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const activeShift = activeShiftQuery.data ?? null

  useEffect(() => {
    if (!activeShift?.opened_at) return
    supabase
      .from('invoices')
      .select('total_usd,total_lbp')
      .eq('created_by', profile?.name ?? '')
      .eq('status', 'saved')
      .gte('created_at', activeShift.opened_at)
      .then(({ data }) =>
        setReconSales(
          (data ?? []).reduce((s: number, r: any) => {
            const usd = normalizeMoney(parseFloat(r.total_usd || 0), 'USD')
            const lbp = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP')
            return s + (usd > 0 ? usd : lbp / 90_000)
          }, 0),
        ),
      )
  }, [activeShift, profile?.name])

  // Live shift elapsed timer — ticks every second
  const [elapsed, setElapsed] = useState('00:00:00')
  useEffect(() => {
    if (!activeShift?.opened_at) { setElapsed('00:00:00'); return }
    function tick() {
      const start = new Date(activeShift!.opened_at!).getTime()
      const diff  = Math.max(0, Math.floor((Date.now() - start) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeShift?.opened_at])

  // Live shift elapsed timer — ticks every second
  const [elapsed, setElapsed] = useState('00:00:00')
  useEffect(() => {
    if (!activeShift?.opened_at) { setElapsed('00:00:00'); return }
    function tick() {
      const start = new Date(activeShift!.opened_at!).getTime()
      const diff  = Math.max(0, Math.floor((Date.now() - start) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeShift?.opened_at])

  const diff = counted ? parseFloat(counted) - reconSales : null

  const openMutation = useMutation({
    mutationFn: async () => {
      if (activeShift) throw new Error('Shift already open')
      const { error } = await (supabase as any).from('shifts').insert({ user_name: profile?.name, station: profile?.station, status: 'open' })
      if (error) throw error
      await log('shift_opened', 'Shift', `Shift opened — ${profile?.station}`)
    },
    onSuccess: () => { toast.success('Shift opened successfully'); void queryClient.invalidateQueries({ queryKey: ['shift'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to open shift'),
  })

  const infoQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('tblInformation').select('*').limit(1).single()
      return data
    },
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) throw new Error('No open shift found')
      const cnt = parseFloat(counted) || 0
      const expected = reconSales
      const difference = cnt - expected
      // Read mismatch threshold from Settings (defaults to $1 if not configured)
      const infoData = infoQuery.data as any
      const mismatchThreshold = parseFloat(infoData?.MismatchThreshold ?? infoData?.mismatch_threshold ?? '1') || 1
      const status = Math.abs(difference) > mismatchThreshold ? 'flagged' : 'closed'
      
      // Atomic guard: only update if shift is STILL open (prevents race condition)
      const { error, count } = await (supabase as any).from('shifts').update({
        status, 
        closed_at: new Date().toISOString(),
        expected_cash_usd: expected, 
        counted_cash_usd: cnt, 
        difference_usd: difference, 
        note: shiftNote,
      }).eq('id', activeShift.id).eq('status', 'open')
      
      if (error) throw error
      if (count === 0) throw new Error('Shift was already closed by another user. Please refresh.')

      await log('shift_closed', 'Shift', `Shift closed — expected ${fmtMoney(expected)} counted ${fmtMoney(cnt)} diff ${fmtMoney(difference)}`)
      if (status === 'flagged') await log('cash_mismatch', 'Shift', `⚠ Cash mismatch — diff ${fmtMoney(difference)}`)

      // WhatsApp Notification
      const info = infoQuery.data as any
      if (info) {
        const phone = info.OwnerWhatsapp || info.owner_whatsapp
        const apiKey = info.CallMeBotApiKey || info.callmebot_api_key || info.WhatsappApiKey

        if (phone && apiKey) {
          let message = `🏠 *AllWay Shift Report*\n`
          message += `👤 Employee: ${profile?.name}\n`
          message += `📍 Station: ${profile?.station}\n`
          message += `💰 Expected: ${fmtMoney(expected)}\n`
          message += `💵 Counted: ${fmtMoney(cnt)}\n`
          message += `📊 Diff: ${fmtMoney(difference)}\n`
          if (status === 'flagged') message += `⚠ *DISCREPANCY DETECTED*\n`
          if (shiftNote) message += `📝 Note: ${shiftNote}`

          await import('@/lib/utils').then(m => m.sendWhatsApp(String(phone), String(apiKey), message))
        }
      }

      return { status, difference }
    },
    onSuccess: ({ status, difference }) => {
      if (status === 'flagged') toast.warning(`Cash mismatch flagged! Diff: ${fmtMoney(difference)}`)
      else toast.success('Shift balanced and closed')
      void queryClient.invalidateQueries({ queryKey: ['shift'] })
      setCounted(''); setShiftNote('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to close shift'),
  })

  const closeDayMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) throw new Error('Supervisor clearance required')
      await log('day_closed', 'Shift', `Day closed by ${profile?.name}`)
    },
    onSuccess: () => toast.success('Day finalized — reports ready'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const generateReport = async () => {
    const start = todayStart()
    const [invRes, expRes, whishRes, shiftRes] = await Promise.all([
      (supabase as any).from('invoices').select('*').eq('status','saved').gte('created_at', start),
      (supabase as any).from('expenses').select('*').gte('created_at', start),
      (supabase as any).from('whish_transactions').select('*').gte('created_at', start),
      supabase.from('shifts').select('*').gte('opened_at', start),
    ])
    const invoices = invRes.data ?? []; const expenses = expRes.data ?? []
    const whish = whishRes.data ?? []; const shifts = shiftRes.data ?? []
    const totalSales = invoices.reduce((s: number, r: any) => {
      const usd = normalizeMoney(parseFloat(r.total_usd || 0), 'USD')
      const lbp = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP')
      return s + (usd > 0 ? usd : lbp / 90_000)
    }, 0)
    const totalExp = expenses.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd || 0), 'USD'), 0)
    const totalComm = whish.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.commission_usd || 0), 'USD'), 0)
    const flagged = shifts.filter((s: any) => s.status === 'flagged')
    const d = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AllWay — Daily Report</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1714}h1{font-size:22px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}.box{background:#f7f4ef;border-radius:8px;padding:14px}.box-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.box-val{font-size:22px;font-weight:700}.green{color:#0f7a4a}.red{color:#c53030}.gold{color:#b8780a}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}th{background:#f2efe9;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888}td{padding:8px;border-bottom:1px solid #eee}h2{font-size:14px;margin:16px 0 8px}.flag{background:#fff5f5;color:#c53030;padding:12px;border-radius:8px;border-left:3px solid #c53030;margin-bottom:16px}.footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}</style></head><body>
<h1>AllWay Services — Daily Report</h1><p style="color:#888;font-size:13px;margin-bottom:20px">${d}</p>
<div class="grid"><div class="box"><div class="box-label">Total sales</div><div class="box-val green">$${totalSales.toFixed(2)}</div></div><div class="box"><div class="box-label">Invoices</div><div class="box-val">${invoices.length}</div></div><div class="box"><div class="box-label">Expenses</div><div class="box-val red">$${totalExp.toFixed(2)}</div></div><div class="box"><div class="box-label">Whish commission</div><div class="box-val gold">$${totalComm.toFixed(2)}</div></div></div>
${flagged.length > 0 ? `<div class="flag">⚠ ${flagged.length} shift(s) flagged — cash mismatch detected</div>` : ''}
<h2>Sales today</h2><table><thead><tr><th>#</th><th>Client</th><th>Amount</th><th>Method</th><th>By</th></tr></thead><tbody>${invoices.map((r: any) => {
  const usd = normalizeMoney(parseFloat(r.total_usd || 0), 'USD')
  const lbp = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP')
  const amount = usd > 0 ? `$${usd.toFixed(2)}` : `${Math.round(lbp).toLocaleString('en-US')} LBP`
  return `<tr><td>${r.id}</td><td>${r.client_name}</td><td>${amount}</td><td>${r.payment_method}</td><td>${escHtml(r.created_by)}</td></tr>`
}).join('')}</tbody></table>
<h2>Expenses</h2><table><thead><tr><th>Supplier</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead><tbody>${expenses.map((r: any) => `<tr><td>${r.supplier}</td><td>$${normalizeMoney(parseFloat(r.amount_usd || 0), 'USD').toFixed(2)}</td><td>${r.description||'—'}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>
<h2>Whish transactions</h2><table><thead><tr><th>Type</th><th>Client</th><th>Amount</th><th>Commission</th></tr></thead><tbody>${whish.map((r: any) => `<tr><td>${r.transaction_type}</td><td>${r.client_name||'—'}</td><td>$${normalizeMoney(parseFloat(r.amount_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.commission_usd || 0), 'USD').toFixed(2)}</td></tr>`).join('')}</tbody></table>
<h2>Shift summary</h2><table><thead><tr><th>Employee</th><th>Station</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Status</th></tr></thead><tbody>${shifts.map((r: any) => `<tr><td>${escHtml(r.user_name)}</td><td>${escHtml(r.station)}</td><td>$${normalizeMoney(parseFloat(r.expected_cash_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.counted_cash_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.difference_usd || 0), 'USD').toFixed(2)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>
<div class="footer">Generated by AllWay Services CRM · ${new Date().toLocaleString('en-GB')}</div></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Shift Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Open, track, and reconcile daily employee shifts.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={generateReport} className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Daily Report
            </Button>
            <Button variant="destructive" size="sm" onClick={() => closeDayMutation.mutate()} className="flex items-center gap-2">
              <StopCircle className="w-4 h-4" />
              Close Day
            </Button>
          </div>
        )}
      </div>

      {/* Main Shift Status Card */}
      <Card className={`border-2 overflow-hidden ${activeShift ? 'border-green-500/20 bg-green-50/30' : 'border-dashed'}`}>
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className={`p-8 flex flex-col justify-center items-center md:items-start space-y-4 md:w-1/3 ${activeShift ? 'bg-green-600 text-white' : 'bg-secondary/50'}`}>
              <div className={`p-4 rounded-full ${activeShift ? 'bg-white/20' : 'bg-secondary'}`}>
                {activeShift ? <Clock className="w-8 h-8 animate-pulse" /> : <Play className="w-8 h-8 text-muted-foreground" />}
              </div>
              <div className="text-center md:text-left">
                <h2 className="text-xl font-bold">{activeShift ? 'Shift in Progress' : 'No Active Shift'}</h2>
                {activeShift ? (
                  <div className="mt-1">
                    <p className="text-green-100 text-xs mb-1">
                      Started at {new Date(activeShift.opened_at ?? '').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Beirut' })}
                    </p>
                    {/* Live elapsed timer */}
                    <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-ping shrink-0" />
                      <span className="font-mono font-black text-2xl tracking-widest text-white tabular-nums">
                        {elapsed}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Start a new shift to record sales.</p>
                )}
              </div>
              {!activeShift && (
                <Button onClick={() => openMutation.mutate()} disabled={openMutation.isPending} className="w-full bg-primary hover:bg-primary/90 font-bold">
                  {openMutation.isPending ? 'Starting...' : 'Open Shift Now'}
                </Button>
              )}
            </div>

            <div className="flex-1 p-8 space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Employee</p>
                  <p className="font-bold">{profile?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Station</p>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider bg-secondary/50">
                    {profile?.station || 'General'}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Expected Cash</p>
                  <p className="font-mono font-bold text-primary text-lg">{fmtMoney(reconSales)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Shift Duration</p>
                  <p className="font-mono text-sm">{activeShift ? 'Ongoing' : '—'}</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <p>Automatic WhatsApp notification will be sent to owner upon closing.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reconciliation Section */}
        <Card className="border-2 shadow-md">
          <CardHeader className="border-b bg-secondary/10">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              Shift Reconciliation
            </CardTitle>
            <CardDescription>Verify your physical cash count against system sales.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="p-4 bg-secondary/20 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">System Sales (Expected)</span>
                <span className="font-mono font-bold text-lg">{fmtMoney(reconSales)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-dashed border-secondary-foreground/20 pt-3">
                <span className="text-sm text-muted-foreground">Your Count (Actual)</span>
                <span className="font-mono font-bold text-lg">{counted ? fmtMoney(parseFloat(counted)) : '$0.00'}</span>
              </div>
              <div className={`flex justify-between items-center border-t-2 pt-3 ${
                diff === null ? 'text-muted-foreground' : 
                (diff !== null && Math.abs(diff) <= 1) ? 'text-green-600' : 'text-destructive'
              }`}>
                <span className="text-sm font-bold">Final Difference</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xl">{diff !== null ? fmtMoney(diff) : '—'}</span>
                  {diff !== null && Math.abs(diff) <= 1 && <CheckCircle2 className="w-5 h-5" />}
                  {diff !== null && Math.abs(diff) > 1 && <AlertCircle className="w-5 h-5" />}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Physical Cash Count (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-muted-foreground font-mono font-bold">$</span>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={counted} 
                    onChange={e => setCounted(e.target.value)} 
                    placeholder="0.00" 
                    className="h-12 pl-8 font-mono text-xl font-bold bg-primary/5 focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Closing Notes</Label>
                <Input 
                  value={shiftNote} 
                  onChange={e => setShiftNote(e.target.value)} 
                  placeholder="Explain any differences..." 
                  className="h-12"
                />
              </div>
            </div>

            <Button 
              onClick={() => closeMutation.mutate()} 
              disabled={closeMutation.isPending || !activeShift || !counted} 
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow-lg shadow-green-600/20"
            >
              {closeMutation.isPending ? 'Processing...' : 'Confirm Count & Close Shift'}
            </Button>
          </CardContent>
        </Card>

        {/* Station Summary */}
        <Card className="border-2 shadow-md flex flex-col">
          <CardHeader className="border-b bg-secondary/10">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Station Activity
            </CardTitle>
            <CardDescription>Overview of all shifts recorded today.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex-1 overflow-auto">
            <div className="space-y-4">
              {stationQuery.isLoading && (
                <div className="py-12 text-center text-muted-foreground italic">Syncing station data...</div>
              )}
              {!stationQuery.isLoading && (stationQuery.data ?? []).length === 0 && (
                <div className="py-12 text-center text-muted-foreground italic">No shift activity logged for today.</div>
              )}
              {(stationQuery.data ?? []).map((s: any) => (
                <div key={s.id} className="group p-4 rounded-xl border-2 hover:border-primary/40 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}>
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-sm leading-none mb-1">{s.user_name}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{s.station || 'Front Desk'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {s.status === 'open' ? (
                      <Badge className="bg-green-600 animate-pulse">ACTIVE</Badge>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`text-xs font-bold font-mono ${s.status === 'flagged' ? 'text-destructive' : 'text-green-600'}`}>
                            {fmtMoney(s.difference_usd ?? 0)}
                          </span>
                          {s.status === 'closed' ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <ShieldCheck className="w-3 h-3 text-destructive" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground italic">Closed {new Date(s.closed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <div className="p-6 border-t bg-secondary/5 mt-auto">
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-dashed border-primary/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span>WhatsApp Alerts Enabled</span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 uppercase tracking-tighter">Verified</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
