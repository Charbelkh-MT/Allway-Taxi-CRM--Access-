import { createClient } from '@supabase/supabase-js'

const USD_RATE = 90000

export default async function handler(req: Request): Promise<Response> {
  // Vercel injects Authorization: Bearer <CRON_SECRET> for cron invocations.
  // If CRON_SECRET is set, only cron calls (or callers with the secret) are allowed.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = (req as any).headers?.get?.('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!supabaseUrl || !supabaseKey) {
    return new Response('Missing Supabase credentials', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Use Lebanon time (Asia/Beirut) to define "today"
  const now = new Date()
  const beirutNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Beirut' }))
  beirutNow.setHours(0, 0, 0, 0)
  const todayUTC = new Date(now.getTime() - (beirutNow.getTime() - now.getTime()))
  const iso = todayUTC.toISOString()

  const [invRes, expRes, pnlRes, whishRes] = await Promise.all([
    supabase.from('invoices').select('total_usd, total_lbp').eq('status', 'saved').gte('created_at', iso),
    supabase.from('expenses').select('amount_usd').eq('status', 'approved').gte('created_at', iso),
    supabase.from('pnl_entries').select('*').gte('created_at', iso).order('created_at', { ascending: false }).limit(1),
    supabase.from('whish_transactions').select('commission_usd, commission_lbp').gte('created_at', iso),
  ])

  const revenue = ((invRes.data ?? []) as any[]).reduce((s, r) => {
    const usd = parseFloat(r.total_usd || 0)
    const lbp = parseFloat(r.total_lbp || 0)
    return s + (usd > 0 ? usd : lbp / USD_RATE)
  }, 0)

  const expenses = ((expRes.data ?? []) as any[]).reduce(
    (s, r) => s + (parseFloat(r.amount_usd) || 0),
    0
  )

  const commUsd = ((whishRes.data ?? []) as any[]).reduce(
    (s, r) => s + (parseFloat(r.commission_usd) || 0),
    0
  )
  const commLbp = ((whishRes.data ?? []) as any[]).reduce(
    (s, r) => s + (parseFloat(r.commission_lbp) || 0),
    0
  )
  const commission = commUsd + commLbp / USD_RATE
  const netProfit = revenue - expenses + commission

  const latestEntry = (pnlRes.data ?? [])[0] as any

  const date = now.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Beirut',
  })
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Beirut',
  })

  const fmt = (n: number) => `$${n.toFixed(2)}`

  const lines = [
    `📊 *Daily Report — ${date}*`,
    `🕙 Sent at ${time} (Beirut)`,
    ``,
    `💵 Net Revenue:      ${fmt(revenue)}`,
    `📉 Expenses:         ${fmt(expenses)}`,
    `🤝 Commission:       ${fmt(commission)}`,
    `📈 *Net Profit:      ${fmt(netProfit)}*`,
  ]

  if (latestEntry) {
    lines.push(``, `💰 Reconciled Balance: ${fmt(parseFloat(latestEntry.total_usd || 0))}`)
    if (latestEntry.station) lines.push(`🏪 Station: ${latestEntry.station}`)
    if (latestEntry.created_by) lines.push(`👤 By: ${latestEntry.created_by}`)
    if (latestEntry.note) lines.push(`📝 Note: ${latestEntry.note}`)
  } else {
    lines.push(``, `⚠️ No reconciliation entry saved today yet.`)
  }

  lines.push(``, `✅ _Allway CRM — Auto Report_`)

  const message = lines.join('\n')

  // Send WhatsApp via Twilio sandbox
  const phonesRaw  = process.env.WHATSAPP_PHONES ?? process.env.WHATSAPP_PHONE ?? ''
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
  const authToken  = process.env.TWILIO_AUTH_TOKEN  ?? ''
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? '+14155238886'

  if (!phonesRaw || !accountSid || !authToken) {
    return new Response(JSON.stringify({ ok: true, message, warning: 'WhatsApp not configured — set WHATSAPP_PHONES, TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const phones = phonesRaw.split(',').map((p: string) => p.trim()).filter(Boolean)
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const from = `whatsapp:${fromNumber.startsWith('+') ? fromNumber : '+' + fromNumber}`

  const results: { phone: string; status: number }[] = []
  for (const phone of phones) {
    const to = `whatsapp:${phone.startsWith('+') ? phone : '+' + phone}`
    const params = new URLSearchParams({ From: from, To: to, Body: message })
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    results.push({ phone, status: res.status })
  }

  return new Response(JSON.stringify({ ok: true, results, message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
