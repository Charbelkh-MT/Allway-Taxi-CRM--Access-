import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  fmtMoney,
  normalizeMoney,
  LBP_MIN,
  sendWhatsApp,
  sendEmail,
  buildShiftWhatsApp,
  buildDailyClosingWhatsApp,
  buildDailyReportHTML,
  escHtml,
  type ShiftSummaryData,
  type DailyReportData,
  type DailyReportFullData,
  type DailyClosingData,
} from '@/lib/utils'
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
  User,
  ArrowUpRight,
  TimerIcon,
  Activity,
} from 'lucide-react'
import type { Shift } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function ShiftPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isAdmin = role === 'admin'

  const [counted, setCounted] = useState('')
  const [shiftNote, setShiftNote] = useState('')
  const [reconSales, setReconSales] = useState(0)

  const activeShiftQuery = useQuery({
    queryKey: ['shift', 'active', profile?.name],
    queryFn: async (): Promise<Shift | null> => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_name', profile?.name ?? '')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
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

  const [elapsed, setElapsed] = useState('00:00:00')
  useEffect(() => {
    if (!activeShift?.opened_at) { setElapsed('00:00:00'); return }
    function tick() {
      const start = new Date(activeShift!.opened_at!).getTime()
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
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
      const infoData = infoQuery.data as any
      const mismatchThreshold = parseFloat(infoData?.MismatchThreshold ?? infoData?.mismatch_threshold ?? '1') || 1
      const status = Math.abs(difference) > mismatchThreshold ? 'flagged' : 'closed'
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
      const shiftStart = activeShift.opened_at!
      const shiftEnd = new Date().toISOString()
      await log('shift_closed', 'Shift', `Shift closed — expected ${fmtMoney(expected)} counted ${fmtMoney(cnt)} diff ${fmtMoney(difference)}`)
      if (status === 'flagged') await log('cash_mismatch', 'Shift', `⚠ Cash mismatch — diff ${fmtMoney(difference)}`)
      const info = infoQuery.data as any
      const shiftSummaryOn = info?.ShiftSummaryEnabled ?? info?.shift_summary_enabled ?? true
      if (shiftSummaryOn && info) {
        const phone = info.OwnerWhatsapp || info.owner_whatsapp || ''
        const legacyKey = info.CallMeBotApiKey || info.callmebot_api_key || ''
        if (phone) {
          const [invRes2, whishRes2] = await Promise.all([
            (supabase as any).from('invoices').select('id,total_usd,total_lbp,payment_method').eq('created_by', profile?.name ?? '').eq('status', 'saved').gte('created_at', shiftStart),
            (supabase as any).from('whish_transactions').select('commission_usd').eq('created_by', profile?.name ?? '').gte('created_at', shiftStart),
          ])
          const invs = (invRes2.data ?? []) as any[]
          const invIds = invs.map((r: any) => r.id)
          const itemsD = invIds.length > 0 ? (((await (supabase as any).from('invoice_items').select('product_name,quantity').in('invoice_id', invIds)).data ?? []) as any[]) : []
          const totUsd = invs.reduce((s: number, r: any) => s + Math.max(0, normalizeMoney(parseFloat(r.total_usd || 0), 'USD')), 0)
          const totLbp = invs.reduce((s: number, r: any) => { const v = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP'); return s + (v > LBP_MIN ? v : 0) }, 0)
          const wComm = ((whishRes2.data ?? []) as any[]).reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.commission_usd || 0), 'USD'), 0)
          const mc: Record<string, number> = {}
          invs.forEach((r: any) => { const m = r.payment_method || 'Unknown'; mc[m] = (mc[m] ?? 0) + 1 })
          const topMethod = Object.entries(mc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'
          const pt: Record<string, number> = {}
          itemsD.forEach((i: any) => { pt[i.product_name || '?'] = (pt[i.product_name || '?'] ?? 0) + (i.quantity || 0) })
          const topProds = Object.entries(pt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => ({ name, qty }))
          const sumData: ShiftSummaryData = {
            employeeName: profile?.name ?? '', station: profile?.station ?? '',
            openedAt: shiftStart, closedAt: shiftEnd,
            totalSalesUsd: totUsd, totalSalesLbp: totLbp, invoiceCount: invs.length,
            topPaymentMethod: topMethod, topProducts: topProds,
            expectedCash: expected, countedCash: cnt, difference, status, note: shiftNote,
            whishCommissionUsd: wComm,
          }
          await sendWhatsApp(phone, legacyKey, buildShiftWhatsApp(sumData))
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
      const { error: shiftErr } = await (supabase as any).from('shifts').update({ status: 'closed', closed_at: new Date().toISOString() }).gte('opened_at', todayStart()).eq('status', 'open')
      if (shiftErr) throw shiftErr
      const start = todayStart()
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const monthStartStr = monthStart.toISOString()
      const [invRes, expRes, whishRes, shiftRes, recRes, clientRes, prodRes, whishMonthRes] = await Promise.all([
        (supabase as any).from('invoices').select('*').eq('status', 'saved').gte('created_at', start),
        (supabase as any).from('expenses').select('amount_usd,amount_lbp,status').gte('created_at', start),
        (supabase as any).from('whish_transactions').select('amount_usd,commission_usd,commission_lbp').gte('created_at', start),
        supabase.from('shifts').select('*').gte('opened_at', start),
        (supabase as any).from('receivables').select('amount_usd').eq('status', 'pending'),
        (supabase as any).from('clients').select('usd_balance'),
        (supabase as any).from('products').select('cost,quantity,currency').eq('active', true),
        (supabase as any).from('whish_transactions').select('commission_usd,commission_lbp').gte('created_at', monthStartStr),
      ])
      const invoices = (invRes.data ?? []) as any[]
      const expenses = (expRes.data ?? []) as any[]
      const whish = (whishRes.data ?? []) as any[]
      const shifts = (shiftRes.data ?? []) as any[]
      const receivables = (recRes.data ?? []) as any[]
      const clients = (clientRes.data ?? []) as any[]
      const products = (prodRes.data ?? []) as any[]
      const whishMonthly = (whishMonthRes.data ?? []) as any[]
      const invIds = invoices.map((r: any) => r.id)
      const itemsD = invIds.length > 0 ? (((await (supabase as any).from('invoice_items').select('product_name,quantity').in('invoice_id', invIds)).data ?? []) as any[]) : []
      const pt: Record<string, number> = {}
      itemsD.forEach((i: any) => { pt[i.product_name || '?'] = (pt[i.product_name || '?'] ?? 0) + (i.quantity || 0) })
      const topProducts = Object.entries(pt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }))
      const totalSalesUsd = invoices.reduce((s: number, r: any) => s + Math.max(0, normalizeMoney(parseFloat(r.total_usd || 0), 'USD')), 0)
      const totalSalesLbp = invoices.reduce((s: number, r: any) => { const v = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP'); return s + (v > LBP_MIN ? v : 0) }, 0)
      const byMethod = (method: string) => invoices.filter((r: any) => r.payment_method === method).reduce((s: number, r: any) => s + Math.max(0, normalizeMoney(parseFloat(r.total_usd || 0), 'USD')), 0)
      const salesCashUsd = byMethod('Cash USD'); const salesWhish = byMethod('Whish'); const salesCard = byMethod('Card'); const salesDebt = byMethod('Debt')
      const salesCashLbp = invoices.filter((r: any) => r.payment_method === 'Cash LBP').reduce((s: number, r: any) => { const v = normalizeMoney(parseFloat(r.total_lbp || 0), 'LBP'); return s + (v > LBP_MIN ? v : 0) }, 0)
      const totalExp = expenses.filter((e: any) => e.status === 'approved').reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd || 0), 'USD'), 0)
      const whishVol = whish.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd || 0), 'USD'), 0)
      const commTodayUsd = whish.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.commission_usd || 0), 'USD'), 0)
      const commTodayLbp = whish.reduce((s: number, r: any) => s + (parseFloat(r.commission_lbp || 0) || 0), 0)
      const commMonthlyUsd = whishMonthly.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.commission_usd || 0), 'USD'), 0)
      const commMonthlyLbp = whishMonthly.reduce((s: number, r: any) => s + (parseFloat(r.commission_lbp || 0) || 0), 0)
      const receivablesTotal = receivables.reduce((s: number, r: any) => s + normalizeMoney(parseFloat(r.amount_usd || 0), 'USD'), 0)
      const clientDebtsTotal = clients.reduce((s: number, c: any) => { const bal = parseFloat(c.usd_balance || 0); return s + (bal < 0 ? Math.abs(bal) : 0) }, 0)
      // All products — LBP converted to USD (identical formula to Products page + Dashboard)
      const stockPhysical = products.reduce((s: number, p: any) => {
        const cost = normalizeMoney(parseFloat(p.cost) || 0, p.currency || 'USD')
        const qty  = parseFloat(p.quantity) || 0
        return s + qty * ((p.currency || 'USD').toUpperCase() === 'LBP' ? cost / 90_000 : cost)
      }, 0)
      // Recharge card stock value (LBP cost → USD)
      const rechargeCardsRes = await (supabase as any).from('recharge_cards').select('cost').eq('status', 'in_stock')
      const rechargeStockUsd = ((rechargeCardsRes?.data ?? []) as any[]).reduce((s: number, r: any) => s + (parseFloat(r.cost) || 0), 0) / 90_000
      const info = infoQuery.data as any
      const capitalUsd = parseFloat(info?.CapitalUsd ?? info?.capital_usd ?? '13000') || 13000
      const stockCash = parseFloat(info?.StockCashBalance ?? '7339.33') || 7339.33
      const flaggedCount = shifts.filter((s: any) => s.status === 'flagged').length
      const dateShort = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Beirut' }).replace(/\//g, '-')
      const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Beirut' })
      const closingData: DailyClosingData = {
        date: dateShort, salesCashUsd, salesCashLbp, salesWhish, salesCard, salesDebt,
        totalSalesUsd, totalSalesLbp, invoiceCount: invoices.length, expenseTotal: totalExp,
        receivablesTotal, clientDebtsTotal, capitalUsd, stockCashBalance: stockCash, stockPhysical: stockPhysical + rechargeStockUsd,
        shiftCount: shifts.length, flaggedCount, commissionTodayUsd: commTodayUsd, commissionTodayLbp: commTodayLbp,
        commissionMonthlyUsd: commMonthlyUsd, commissionMonthlyLbp: commMonthlyLbp, topProducts,
      }
      const reportData: DailyReportData = {
        date: dateStr, totalSalesUsd, totalSalesLbp, invoiceCount: invoices.length,
        expenseTotal: totalExp, whishVolume: whishVol, whishCommission: commTodayUsd,
        shiftCount: shifts.length, flaggedCount, topProducts,
      }
      const phone = info?.OwnerWhatsapp || info?.owner_whatsapp || ''
      const legacyKey = info?.CallMeBotApiKey || info?.callmebot_api_key || ''
      const ownerEml = info?.OwnerEmail || info?.owner_email || ''
      const dailyWaOn = info?.DailyReportEnabled ?? info?.daily_report_enabled ?? false
      const dailyEmailOn = info?.DailyEmailEnabled ?? info?.daily_email_enabled ?? false
      if (phone && dailyWaOn) await sendWhatsApp(phone, legacyKey, buildDailyClosingWhatsApp(closingData))
      if (dailyEmailOn && ownerEml) {
        const fullData: DailyReportFullData = { ...reportData, invoices, expenses, whishTransactions: whish, shifts }
        await sendEmail(ownerEml, `AllWay Daily Report — ${dateStr}`, buildDailyReportHTML(fullData))
      }
      await log('day_closed', 'Shift', `Day closed by ${profile?.name} — ${invoices.length} invoices, $${totalSalesUsd.toFixed(2)} USD`)
    },
    onSuccess: () => { toast.success('Day closed — notifications sent'); void queryClient.invalidateQueries({ queryKey: ['shift'] }) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const generateReport = async () => {
    const start = todayStart()
    const [invRes, expRes, whishRes, shiftRes] = await Promise.all([
      (supabase as any).from('invoices').select('*').eq('status', 'saved').gte('created_at', start),
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
<h2>Expenses</h2><table><thead><tr><th>Supplier</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead><tbody>${expenses.map((r: any) => `<tr><td>${r.supplier}</td><td>$${normalizeMoney(parseFloat(r.amount_usd || 0), 'USD').toFixed(2)}</td><td>${r.description || '—'}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>
<h2>Whish transactions</h2><table><thead><tr><th>Type</th><th>Client</th><th>Amount</th><th>Commission</th></tr></thead><tbody>${whish.map((r: any) => `<tr><td>${r.transaction_type}</td><td>${r.client_name || '—'}</td><td>$${normalizeMoney(parseFloat(r.amount_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.commission_usd || 0), 'USD').toFixed(2)}</td></tr>`).join('')}</tbody></table>
<h2>Shift summary</h2><table><thead><tr><th>Employee</th><th>Station</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Status</th></tr></thead><tbody>${shifts.map((r: any) => `<tr><td>${escHtml(r.user_name)}</td><td>${escHtml(r.station)}</td><td>$${normalizeMoney(parseFloat(r.expected_cash_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.counted_cash_usd || 0), 'USD').toFixed(2)}</td><td>$${normalizeMoney(parseFloat(r.difference_usd || 0), 'USD').toFixed(2)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>
<div class="footer">Generated by AllWay Services CRM · ${new Date().toLocaleString('en-GB')}</div></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  const stationData = stationQuery.data ?? []

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_theme(colors.indigo.500)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Shift Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Shift Control</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Open, track, and reconcile daily employee shifts in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={generateReport}
                className="h-12 border-2 font-black px-6 rounded-2xl gap-2"
              >
                <FileText className="w-4 h-4" />
                DAILY REPORT
              </Button>
              <Button
                onClick={() => closeDayMutation.mutate()}
                disabled={closeDayMutation.isPending}
                className="h-12 bg-rose-600 hover:bg-rose-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-rose-600/20"
              >
                {closeDayMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />CLOSING...</> : 'CLOSE DAY'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Shift Status', value: activeShift ? 'ACTIVE' : 'INACTIVE', icon: Activity, color: activeShift ? 'text-emerald-600' : 'text-muted-foreground', sub: activeShift ? 'Currently Running' : 'No Active Shift' },
          { label: 'Expected Cash', value: fmtMoney(reconSales), icon: Wallet, color: 'text-indigo-600', sub: 'System Sales Total' },
          { label: 'Elapsed Time', value: activeShift ? elapsed : '—', icon: TimerIcon, color: 'text-amber-600', sub: 'Live Timer' },
          { label: "Today's Shifts", value: stationData.length, icon: BarChart3, color: 'text-rose-600', sub: 'Station Activity' },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary">
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight font-mono ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Shift Status Banner */}
      <Card className={`rounded-3xl border-2 overflow-hidden shadow-none ${activeShift ? 'border-emerald-300' : 'border-dashed'}`}>
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className={`p-8 flex flex-col justify-center items-center md:items-start space-y-4 md:w-72 ${activeShift ? 'bg-emerald-600 text-white' : 'bg-secondary/50'}`}>
              <div className={`p-4 rounded-full ${activeShift ? 'bg-white/20' : 'bg-secondary'}`}>
                {activeShift ? <Clock className="w-8 h-8 animate-pulse" /> : <Play className="w-8 h-8 text-muted-foreground" />}
              </div>
              <div className="text-center md:text-left">
                <h2 className="text-xl font-black uppercase tracking-tight italic">
                  {activeShift ? 'Shift In Progress' : 'No Active Shift'}
                </h2>
                {activeShift ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-emerald-100 text-xs font-bold">
                      Started {new Date(activeShift.opened_at ?? '').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Beirut' })}
                    </p>
                    <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-2xl px-4 py-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-ping shrink-0" />
                      <span className="font-mono font-black text-2xl tracking-widest text-white tabular-nums">{elapsed}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground font-medium mt-1">Start a shift to record sales.</p>
                )}
              </div>
              {!activeShift && (
                <Button
                  onClick={() => openMutation.mutate()}
                  disabled={openMutation.isPending}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20"
                >
                  {openMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />STARTING...</> : 'OPEN SHIFT NOW'}
                </Button>
              )}
              {activeShift && (
                <Button
                  className="w-full h-12 bg-white text-emerald-700 hover:bg-green-50 font-black border-0 shadow-md rounded-2xl"
                  onClick={async () => {
                    await (supabase as any).from('shifts').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeShift.id).eq('status', 'open')
                    queryClient.setQueryData(['shift', 'active', profile?.name], null)
                    void queryClient.invalidateQueries({ queryKey: ['shift'] })
                    setCounted(''); setShiftNote('')
                  }}
                >
                  END SHIFT
                </Button>
              )}
            </div>

            <div className="flex-1 p-8 space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Employee', val: profile?.name || '—' },
                  { label: 'Station', val: profile?.station || 'General' },
                  { label: 'Expected Cash', val: fmtMoney(reconSales) },
                  { label: 'Shift Duration', val: activeShift ? 'Ongoing' : '—' },
                ].map((info) => (
                  <div key={info.label}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{info.label}</p>
                    <p className="font-black text-sm tracking-tight">{info.val}</p>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="p-2 bg-emerald-100 rounded-xl">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <p className="font-bold">Automatic WhatsApp notification will be sent to owner upon shift close.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Reconciliation Card */}
        <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
          <div className="p-6 bg-indigo-600 text-white">
            <h2 className="text-xl font-black uppercase tracking-tighter italic">SHIFT RECONCILIATION</h2>
            <p className="text-indigo-100 text-sm font-medium">Verify your physical cash against system sales.</p>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="p-5 bg-secondary/20 rounded-2xl space-y-3 border-2 border-dashed">
              {[
                { label: 'System Sales (Expected)', val: fmtMoney(reconSales), color: 'text-foreground' },
                { label: 'Your Count (Actual)', val: counted ? fmtMoney(parseFloat(counted)) : '$0.00', color: 'text-indigo-600' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted-foreground">{row.label}</span>
                  <span className={`font-mono font-black text-lg ${row.color}`}>{row.val}</span>
                </div>
              ))}
              <div className={`flex justify-between items-center border-t-2 pt-3 ${diff === null ? 'text-muted-foreground' : Math.abs(diff) <= 1 ? 'text-emerald-600' : 'text-destructive'}`}>
                <span className="text-sm font-black uppercase tracking-wide">Final Difference</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xl">{diff !== null ? fmtMoney(diff) : '—'}</span>
                  {diff !== null && Math.abs(diff) <= 1 && <CheckCircle2 className="w-5 h-5" />}
                  {diff !== null && Math.abs(diff) > 1 && <AlertCircle className="w-5 h-5" />}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Physical Cash Count (USD)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-muted-foreground font-mono font-black">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    placeholder="0.00"
                    className="h-14 pl-9 font-mono text-xl font-black border-2 bg-indigo-50/30 focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Closing Notes</Label>
                <Input
                  value={shiftNote}
                  onChange={(e) => setShiftNote(e.target.value)}
                  placeholder="Explain any differences..."
                  className="h-12 border-2 font-bold"
                />
              </div>
            </div>

            <Button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending || !activeShift || !counted}
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-600/20"
            >
              {closeMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />PROCESSING...</> : 'CONFIRM COUNT & CLOSE SHIFT'}
            </Button>
          </CardContent>
        </Card>

        {/* Station Activity */}
        <Card className="rounded-3xl border-2 shadow-none overflow-hidden flex flex-col">
          <div className="p-6 bg-secondary/30 border-b">
            <h2 className="text-lg font-black uppercase tracking-tight italic">Station Activity</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's Shift Overview</p>
          </div>
          <CardContent className="p-6 flex-1 overflow-auto space-y-3">
            {stationQuery.isLoading && (
              <div className="py-12 text-center text-muted-foreground italic">Syncing station data...</div>
            )}
            {!stationQuery.isLoading && stationData.length === 0 && (
              <div className="py-12 text-center text-muted-foreground italic">No shift activity logged for today.</div>
            )}
            {stationData.map((s: any) => (
              <div key={s.id} className="p-4 rounded-2xl border-2 hover:border-indigo-200 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${s.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-black text-sm leading-none mb-1 uppercase">{s.user_name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{s.station || 'Front Desk'}</p>
                  </div>
                </div>
                <div className="text-right">
                  {s.status === 'open' ? (
                    <Badge className="bg-emerald-600 animate-pulse font-black text-[10px] uppercase">ACTIVE</Badge>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-xs font-black font-mono ${s.status === 'flagged' ? 'text-destructive' : 'text-emerald-600'}`}>
                          {fmtMoney(s.difference_usd ?? 0)}
                        </span>
                        {s.status === 'closed'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          : <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                        }
                      </div>
                      <p className="text-[9px] font-bold text-muted-foreground italic">
                        Closed {new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="p-5 border-t bg-secondary/10 mt-auto">
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-dashed">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-xl">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <span className="text-xs font-black uppercase tracking-wide">WhatsApp Alerts</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-black bg-emerald-50 text-emerald-700 border-emerald-200 uppercase tracking-widest">
                VERIFIED
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
