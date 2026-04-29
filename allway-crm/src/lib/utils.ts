import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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

export async function sendWhatsApp(phone: string, apiKey: string, message: string) {
  if (!phone || !apiKey || !message) return
  const encodedMsg = encodeURIComponent(message)
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone.trim()}&text=${encodedMsg}&apikey=${apiKey.trim()}`
  try {
    await fetch(url, { mode: 'no-cors' }) // CallMeBot API works with simple GET
  } catch (e) {
    console.error('WhatsApp failed:', e)
  }
}
