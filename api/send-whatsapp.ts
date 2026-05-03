// Vercel serverless function — sends WhatsApp via Twilio sandbox
// Required env vars (set in Vercel dashboard):
//   TWILIO_ACCOUNT_SID   — from console.twilio.com
//   TWILIO_AUTH_TOKEN    — from console.twilio.com
//   TWILIO_FROM_NUMBER   — the sandbox number, e.g. +14155238886

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
  const authToken  = process.env.TWILIO_AUTH_TOKEN  ?? ''
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? '+14155238886'

  if (!accountSid || !authToken) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Twilio credentials not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let phone: string, message: string
  try {
    const body = await req.json()
    phone   = (body.phone   ?? '').trim()
    message = (body.message ?? '').trim()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!phone || !message) {
    return new Response(JSON.stringify({ ok: false, error: 'phone and message are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const to   = `whatsapp:${phone.startsWith('+') ? phone : '+' + phone}`
  const from = `whatsapp:${fromNumber.startsWith('+') ? fromNumber : '+' + fromNumber}`

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const params = new URLSearchParams({ From: from, To: to, Body: message })

  try {
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: (data as any).message ?? `Twilio error ${res.status}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ ok: true, sid: (data as any).sid }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
