import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All times displayed in Lebanon timezone (UTC+3)
const BEIRUT_TZ = 'Asia/Beirut'

export function fmt(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: BEIRUT_TZ })
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: BEIRUT_TZ }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: BEIRUT_TZ })
}

export function fmtMoney(v: number | null | undefined, currency: 'USD' | 'LBP' = 'USD'): string {
  if (v == null) return '—'
  if (currency === 'LBP') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + ' LBP'
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
}

const LEGACY_MONEY_SCALE = 10_000
const LEGACY_USD_THRESHOLD = 10_000
const LEGACY_LBP_THRESHOLD = 100_000_000

export function normalizeMoney(v: number | null | undefined, currency: 'USD' | 'LBP' = 'USD'): number {
  const value = Number(v ?? 0)
  if (!Number.isFinite(value)) return 0
  const abs = Math.abs(value)
  if (currency === 'USD' && abs >= LEGACY_USD_THRESHOLD) return value / LEGACY_MONEY_SCALE
  if (currency === 'LBP' && abs >= LEGACY_LBP_THRESHOLD) return value / LEGACY_MONEY_SCALE
  return value
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Global exchange rate (LBP per $1 USD) ────────────────────────────────────
export const USD_RATE = 89_500
export const LBP_MIN  = 1_000

// ─── HTML escaping ────────────────────────────────────────────────────────────
export function escHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// ─── WhatsApp (provider-agnostic) ─────────────────────────────────────────────
/**
 * Send a WhatsApp message via the configured provider.
 * Provider is selected by VITE_WA_PROVIDER env var (green-api | ultramsg | callmebot).
 * The _legacyApiKey param is kept for backward compatibility with CallMeBot.
 */
export async function sendWhatsApp(phone: string, _legacyApiKey: string, message: string): Promise<boolean> {
  if (!phone || !message) return false
  const provider = (import.meta.env.VITE_WA_PROVIDER as string | undefined) ?? 'callmebot'
  try {
    if (provider === 'green-api') {
      const instanceId = import.meta.env.VITE_GREEN_API_INSTANCE_ID as string | undefined
      const token      = import.meta.env.VITE_GREEN_API_TOKEN as string | undefined
      if (!instanceId || !token || instanceId === 'YOUR_INSTANCE_ID') return false
      const chatId = `${phone.replace(/\D/g, '')}@c.us`
      await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      })
      return true
    }

    if (provider === 'ultramsg') {
      const instanceId = import.meta.env.VITE_ULTRAMSG_INSTANCE_ID as string | undefined
      const token      = import.meta.env.VITE_ULTRAMSG_TOKEN as string | undefined
      if (!instanceId || !token) return false
      await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, to: phone, body: message }).toString(),
      })
      return true
    }

    // Fallback: CallMeBot
    if (!_legacyApiKey) return false
    const encoded = encodeURIComponent(message)
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone.trim()}&text=${encoded}&apikey=${_legacyApiKey.trim()}`, { mode: 'no-cors' })
    return true
  } catch (e) {
    console.error('WhatsApp send failed:', e)
    return false
  }
}

// ─── Email via Resend ─────────────────────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY as string | undefined
  if (!apiKey || !to || apiKey === 'YOUR_RESEND_API_KEY') return false
  try {
    const fromAddr = (import.meta.env.VITE_EMAIL_FROM as string | undefined) ?? 'AllWay CRM <reports@allwayservices.com>'
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    await resend.emails.send({ from: fromAddr, to, subject, html })
    return true
  } catch (e) {
    console.error('Email send failed:', e)
    return false
  }
}

// ─── Shift-end WhatsApp message builder ──────────────────────────────────────
export interface ShiftSummaryData {
  employeeName: string
  station: string
  openedAt: string
  closedAt: string
  totalSalesUsd: number
  totalSalesLbp: number
  invoiceCount: number
  topPaymentMethod: string
  topProducts: { name: string; qty: number }[]
  expectedCash: number
  countedCash: number
  difference: number
  status: 'closed' | 'flagged'
  note: string
  whishCommissionUsd: number
}

export function buildShiftWhatsApp(d: ShiftSummaryData): string {
  const start   = new Date(d.openedAt)
  const end     = new Date(d.closedAt)
  const diffMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
  const h = Math.floor(diffMin / 60), m = diffMin % 60
  const startFmt = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: BEIRUT_TZ })
  const endFmt   = end.toLocaleTimeString('en-GB',   { hour: '2-digit', minute: '2-digit', timeZone: BEIRUT_TZ })
  const dateFmt  = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: BEIRUT_TZ })

  let msg = `🏪 *AllWay Shift Report — ${dateFmt}*\n`
  msg += `👤 ${d.employeeName} · ${d.station}\n`
  msg += `🕐 ${startFmt} → ${endFmt}  _(${h}h ${m}m)_\n`
  msg += `──────────────────\n`
  msg += `🧾 Invoices: ${d.invoiceCount}  ·  Top: ${d.topPaymentMethod}\n`
  if (d.totalSalesUsd > 0)       msg += `💵 Sales USD: *${fmtMoney(d.totalSalesUsd)}*\n`
  if (d.totalSalesLbp > LBP_MIN) msg += `💰 Sales LBP: *${fmtMoney(d.totalSalesLbp, 'LBP')}*\n`
  msg += `──────────────────\n`
  msg += `📊 Expected: ${fmtMoney(d.expectedCash)}\n`
  msg += `💵 Counted:  ${fmtMoney(d.countedCash)}\n`
  msg += `${Math.abs(d.difference) <= 1 ? '✅' : '🚨'} Diff: *${fmtMoney(d.difference)}*\n`
  if (d.whishCommissionUsd > 0)  msg += `🎯 Whish Comm: ${fmtMoney(d.whishCommissionUsd)}\n`
  if (d.topProducts.length > 0) {
    msg += `──────────────────\n🏆 Top items:\n`
    d.topProducts.slice(0, 3).forEach(p => { msg += `  · ${p.name.slice(0, 30)}: ×${p.qty}\n` })
  }
  if (d.status === 'flagged') msg += `\n⚠️ *DISCREPANCY FLAGGED*\n`
  if (d.note)                 msg += `📝 _${d.note.slice(0, 120)}_`
  return msg
}

// ─── End-of-day WhatsApp summary builder ─────────────────────────────────────
export interface DailyReportData {
  date: string
  totalSalesUsd: number
  totalSalesLbp: number
  invoiceCount: number
  expenseTotal: number
  whishVolume: number
  whishCommission: number
  shiftCount: number
  flaggedCount: number
  topProducts: { name: string; qty: number }[]
}

export function buildDailyWhatsApp(d: DailyReportData): string {
  let msg = `📅 *AllWay Daily Report*\n${d.date}\n`
  msg += `══════════════════\n`
  msg += `💵 Sales USD: *${fmtMoney(d.totalSalesUsd)}*\n`
  if (d.totalSalesLbp > LBP_MIN) msg += `💰 Sales LBP: *${fmtMoney(d.totalSalesLbp, 'LBP')}*\n`
  msg += `🧾 Invoices: ${d.invoiceCount}\n`
  msg += `──────────────────\n`
  msg += `📤 Expenses: ${fmtMoney(d.expenseTotal)}\n`
  msg += `📱 Whish Vol: ${fmtMoney(d.whishVolume)}  ·  Comm: *${fmtMoney(d.whishCommission)}*\n`
  msg += `──────────────────\n`
  msg += `👥 Shifts today: ${d.shiftCount}`
  if (d.flaggedCount > 0) msg += `  ·  ⚠️ *${d.flaggedCount} flagged*`
  msg += '\n'
  if (d.topProducts.length > 0) {
    msg += `──────────────────\n🏆 Top products:\n`
    d.topProducts.slice(0, 5).forEach(p => { msg += `  · ${p.name.slice(0, 28)}: ×${p.qty}\n` })
  }
  return msg
}

// ─── Owner closing summary (matches Access format) ───────────────────────────
export interface DailyClosingData {
  date: string          // e.g. "01-05-2026"
  // Sales breakdown by payment method
  salesCashUsd: number
  salesCashLbp: number  // raw LBP
  salesWhish: number
  salesCard: number
  salesDebt: number
  totalSalesUsd: number
  totalSalesLbp: number // raw LBP
  invoiceCount: number
  // Expenses (approved today)
  expenseTotal: number
  // Debts owed to the business
  receivablesTotal: number  // pending receivables sum
  clientDebtsTotal: number  // sum of negative client balances
  // Balance sheet / out amounts
  capitalUsd: number        // fixed capital from settings
  stockCashBalance: number  // Access StockCash (the ~$7,339 running counter)
  stockPhysical: number     // cost × qty across all USD products
  // Shifts
  shiftCount: number
  flaggedCount: number
  // Commission from Whish
  commissionTodayUsd: number
  commissionTodayLbp: number
  commissionMonthlyUsd: number
  commissionMonthlyLbp: number
  // Top items sold today
  topProducts: { name: string; qty: number }[]
}

export function buildDailyClosingWhatsApp(d: DailyClosingData): string {
  const LBP_RATE = 90_000
  const f2 = (n: number) => n.toFixed(2)
  const fLbp = (n: number) => Math.round(n).toLocaleString('en-GB')
  const pnl   = d.totalSalesUsd - d.expenseTotal
  const total = pnl + d.commissionTodayUsd + (d.commissionTodayLbp / LBP_RATE)

  let msg = `📅 *Closing Summary — ${d.date}*\n`
  msg += `══════════════════\n`

  // ── USD Amounts (today's sales by method) ─────────────────────────────────
  msg += `💵 *USD Amounts*\n`
  if (d.salesCashUsd  > 0) msg += `  Cash:   $${f2(d.salesCashUsd)}\n`
  if (d.salesWhish    > 0) msg += `  App:    $${f2(d.salesWhish)}\n`
  if (d.salesCard     > 0) msg += `  Card:   $${f2(d.salesCard)}\n`
  if (d.salesDebt     > 0) msg += `  Debt:   $${f2(d.salesDebt)}\n`
  msg += `  *Total: $${f2(d.totalSalesUsd)}*\n`

  // ── LBP Amounts ────────────────────────────────────────────────────────────
  if (d.salesCashLbp > LBP_MIN) {
    msg += `──────────────────\n`
    msg += `💰 *LBP Amounts*\n`
    msg += `  Cash: ${fLbp(d.salesCashLbp)} / $${f2(d.salesCashLbp / LBP_RATE)}\n`
    if (d.totalSalesLbp > d.salesCashLbp)
      msg += `  Other LBP: ${fLbp(d.totalSalesLbp - d.salesCashLbp)} / $${f2((d.totalSalesLbp - d.salesCashLbp) / LBP_RATE)}\n`
  }

  // ── Debts ──────────────────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `🔴 *Debts*\n`
  msg += `  Total: $${f2(d.receivablesTotal + d.clientDebtsTotal)}\n`
  if (d.receivablesTotal > 0) msg += `  Receivables: $${f2(d.receivablesTotal)}\n`
  if (d.clientDebtsTotal > 0) msg += `  Client debts: $${f2(d.clientDebtsTotal)}\n`

  // ── Out Amounts ────────────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `📤 *Out Amounts*\n`
  msg += `  Capital: $${f2(d.capitalUsd)}\n`
  msg += `  Cash Stock: $${f2(d.stockCashBalance)}\n`
  msg += `  Receivables: $${f2(d.receivablesTotal)}\n`
  msg += `  Expenses: $${f2(d.expenseTotal)}\n`

  // ── PNL ────────────────────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `📊 *PNL*\n`
  msg += `  Sales: $${f2(d.totalSalesUsd)}\n`
  msg += `  Expenses: -$${f2(d.expenseTotal)}\n`
  msg += `  *Profit: $${f2(pnl)}*\n`

  // ── Commission ─────────────────────────────────────────────────────────────
  if (d.commissionTodayUsd > 0 || d.commissionTodayLbp > 0) {
    msg += `──────────────────\n`
    msg += `🎯 *Commission Summary*\n`
    if (d.commissionTodayUsd  > 0) msg += `  Today USD: $${f2(d.commissionTodayUsd)}\n`
    if (d.commissionTodayLbp  > LBP_MIN) msg += `  Today LBP: ${fLbp(d.commissionTodayLbp)}\n`
    if (d.commissionMonthlyUsd > 0) {
      msg += `\n  _Monthly (to date)_\n`
      msg += `  USD: $${f2(d.commissionMonthlyUsd)}\n`
      if (d.commissionMonthlyLbp > LBP_MIN)
        msg += `  LBP: ${fLbp(d.commissionMonthlyLbp)}\n`
    }
  }

  // ── Profit + Commission ─────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `💫 *Profit + Commission*\n`
  msg += `  $${f2(pnl)} + $${f2(d.commissionTodayUsd)} = *$${f2(total)}*\n`

  // ── Stock Value ─────────────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `📦 *Stock Value*\n`
  msg += `  Physical: $${f2(d.stockPhysical)}\n`
  msg += `  Cash side: $${f2(d.stockCashBalance)}\n`
  msg += `  *Total: $${f2(d.stockPhysical + d.stockCashBalance)}*\n`

  // ── Shifts ─────────────────────────────────────────────────────────────────
  msg += `──────────────────\n`
  msg += `👥 Shifts: ${d.shiftCount}`
  if (d.flaggedCount > 0) msg += `  ·  ⚠️ *${d.flaggedCount} flagged*`
  msg += '\n'

  // ── Top Products ────────────────────────────────────────────────────────────
  if (d.topProducts.length > 0) {
    msg += `──────────────────\n🏆 *Top Products*\n`
    d.topProducts.slice(0, 5).forEach(p => { msg += `  · ${p.name.slice(0, 28)}: ×${p.qty}\n` })
  }

  msg += `══════════════════\n✅ *Close Day*`
  return msg
}

// ─── End-of-day full HTML email builder ──────────────────────────────────────
export interface DailyReportFullData extends DailyReportData {
  invoices: any[]
  expenses: any[]
  whishTransactions: any[]
  shifts: any[]
}

export function buildDailyReportHTML(d: DailyReportFullData): string {
  const styles = `
    body{font-family:Arial,sans-serif;padding:24px;color:#1a1714;background:#fff;max-width:800px;margin:0 auto}
    h1{font-size:22px;margin-bottom:4px;color:#1a1714}
    .sub{color:#888;font-size:13px;margin-bottom:24px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
    .box{background:#f7f4ef;border-radius:8px;padding:12px 14px}
    .box-label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
    .box-val{font-size:20px;font-weight:700}
    .green{color:#0f7a4a}.red{color:#c53030}.gold{color:#b8780a}.blue{color:#1d4ed8}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
    th{background:#f2efe9;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888}
    td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
    .flag{background:#fff5f5;color:#c53030;padding:10px 14px;border-radius:6px;border-left:3px solid #c53030;margin-bottom:16px;font-size:13px}
    h2{font-size:13px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:1px;color:#888}
    .footer{margin-top:32px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
  `

  const kpi = [
    { label: 'Total Sales USD', val: fmtMoney(d.totalSalesUsd), cls: 'green' },
    { label: 'Total Invoices',  val: String(d.invoiceCount),    cls: '' },
    { label: 'Expenses',        val: fmtMoney(d.expenseTotal),  cls: 'red' },
    { label: 'Whish Commission',val: fmtMoney(d.whishCommission), cls: 'gold' },
  ]

  const kpiHtml = `<div class="grid">${kpi.map(k =>
    `<div class="box"><div class="box-label">${k.label}</div><div class="box-val ${k.cls}">${k.val}</div></div>`
  ).join('')}</div>`

  const flagHtml = d.flaggedCount > 0
    ? `<div class="flag">⚠ ${d.flaggedCount} shift(s) flagged — cash mismatch detected</div>`
    : ''

  const invRows = d.invoices.map((r: any) =>
    `<tr><td>${escHtml(r.id)}</td><td>${escHtml(r.client_name)}</td>
     <td>${fmtMoney(normalizeMoney(parseFloat(r.total_usd||0),'USD'))}</td>
     <td>${escHtml(r.payment_method)}</td><td>${escHtml(r.created_by)}</td>
     <td>${r.created_at ? new Date(r.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:BEIRUT_TZ}) : ''}</td></tr>`
  ).join('')

  const expRows = d.expenses.map((r: any) =>
    `<tr><td>${escHtml(r.supplier)}</td>
     <td>${fmtMoney(normalizeMoney(parseFloat(r.amount_usd||0),'USD'))}</td>
     <td>${escHtml(r.description)}</td><td>${escHtml(r.status)}</td>
     <td>${escHtml(r.submitted_by)}</td></tr>`
  ).join('')

  const whishRows = d.whishTransactions.map((r: any) =>
    `<tr><td>${escHtml(r.transaction_type)}</td><td>${escHtml(r.client_name)}</td>
     <td>${fmtMoney(normalizeMoney(parseFloat(r.amount_usd||0),'USD'))}</td>
     <td>${fmtMoney(normalizeMoney(parseFloat(r.commission_usd||0),'USD'))}</td>
     <td>${escHtml(r.created_by)}</td></tr>`
  ).join('')

  const shiftRows = d.shifts.map((r: any) =>
    `<tr><td>${escHtml(r.user_name)}</td><td>${escHtml(r.station)}</td>
     <td>${fmtMoney(r.expected_cash_usd||0)}</td>
     <td>${fmtMoney(r.counted_cash_usd||0)}</td>
     <td style="color:${Math.abs(r.difference_usd||0)>1?'#c53030':'#0f7a4a'}">${fmtMoney(r.difference_usd||0)}</td>
     <td>${escHtml(r.status)}</td></tr>`
  ).join('')

  const topProdRows = d.topProducts.map(p =>
    `<tr><td>${escHtml(p.name)}</td><td>${p.qty}</td></tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AllWay Daily Report</title>
<style>${styles}</style></head><body>
<h1>AllWay Services — Daily Report</h1>
<div class="sub">${escHtml(d.date)} · Generated ${new Date().toLocaleString('en-GB',{timeZone:BEIRUT_TZ})}</div>
${kpiHtml}
${flagHtml}
${d.topProducts.length?`<h2>Top Products Sold</h2><table><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody>${topProdRows}</tbody></table>`:''}
<h2>Sales Today (${d.invoiceCount} invoices)</h2>
<table><thead><tr><th>#</th><th>Client</th><th>Amount</th><th>Method</th><th>By</th><th>Time</th></tr></thead><tbody>${invRows||'<tr><td colspan="6" style="color:#888">No invoices today</td></tr>'}</tbody></table>
<h2>Expenses (${d.expenses.length})</h2>
<table><thead><tr><th>Supplier</th><th>Amount</th><th>Description</th><th>Status</th><th>By</th></tr></thead><tbody>${expRows||'<tr><td colspan="5" style="color:#888">No expenses today</td></tr>'}</tbody></table>
<h2>Whish Transactions (${d.whishTransactions.length})</h2>
<table><thead><tr><th>Type</th><th>Client</th><th>Amount</th><th>Commission</th><th>By</th></tr></thead><tbody>${whishRows||'<tr><td colspan="5" style="color:#888">No Whish transactions today</td></tr>'}</tbody></table>
<h2>Shift Summary (${d.shifts.length} shifts)</h2>
<table><thead><tr><th>Employee</th><th>Station</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Status</th></tr></thead><tbody>${shiftRows||'<tr><td colspan="6" style="color:#888">No shifts today</td></tr>'}</tbody></table>
<div class="footer">Generated by AllWay Services CRM · ${new Date().toLocaleString('en-GB',{timeZone:BEIRUT_TZ})}</div>
</body></html>`
}
