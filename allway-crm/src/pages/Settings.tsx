import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function pickExistingKey(row: Record<string, unknown> | null | undefined, candidates: string[]) {
  if (!row) return null
  const keys = Object.keys(row)
  for (const candidate of candidates) {
    const exact = keys.find(k => k === candidate)
    if (exact) return exact
    const ci = keys.find(k => k.toLowerCase() === candidate.toLowerCase())
    if (ci) return ci
  }
  return null
}

export default function Settings() {
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin' || role === 'supervisor'

  const [phone, setPhone] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [alertVoid, setAlertVoid] = useState('1')
  const [alertMismatch, setAlertMismatch] = useState('1')
  const [expThreshold, setExpThreshold] = useState('50')

  const infoQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('tblInformation').select('*').limit(1).single()
      return data
    },
  })

  useEffect(() => {
    const row = (infoQuery.data ?? null) as Record<string, unknown> | null
    if (!row) return

    const phoneKey = pickExistingKey(row, ['OwnerWhatsapp', 'owner_whatsapp'])
    const apiKeyKey = pickExistingKey(row, ['CallMeBotApiKey', 'callmebot_api_key', 'WhatsappApiKey'])
    const alertVoidKey = pickExistingKey(row, ['AlertOnVoid', 'alert_on_void'])
    const alertMismatchKey = pickExistingKey(row, ['AlertOnCashMismatch', 'alert_on_cash_mismatch'])
    const thresholdKey = pickExistingKey(row, ['ExpenseAlertThresholdUsd', 'expense_alert_threshold_usd'])

    setPhone(String(phoneKey ? (row[phoneKey] ?? '') : ''))
    setApiKey(String(apiKeyKey ? (row[apiKeyKey] ?? '') : ''))
    setAlertVoid(String(alertVoidKey ? (row[alertVoidKey] ?? '1') : '1'))
    setAlertMismatch(String(alertMismatchKey ? (row[alertMismatchKey] ?? '1') : '1'))
    setExpThreshold(String(thresholdKey ? (row[thresholdKey] ?? '50') : '50'))
  }, [infoQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const row = (infoQuery.data ?? null) as Record<string, unknown> | null
      if (!row) throw new Error('Settings row not found')

      const payload: Record<string, unknown> = {}
      const phoneKey = pickExistingKey(row, ['OwnerWhatsapp', 'owner_whatsapp']) ?? 'OwnerWhatsapp'
      payload[phoneKey] = phone.trim()

      const apiKeyKey = pickExistingKey(row, ['CallMeBotApiKey', 'callmebot_api_key', 'WhatsappApiKey'])
      if (apiKeyKey) payload[apiKeyKey] = apiKey.trim()

      const alertVoidKey = pickExistingKey(row, ['AlertOnVoid', 'alert_on_void'])
      if (alertVoidKey) payload[alertVoidKey] = alertVoid

      const alertMismatchKey = pickExistingKey(row, ['AlertOnCashMismatch', 'alert_on_cash_mismatch'])
      if (alertMismatchKey) payload[alertMismatchKey] = alertMismatch

      const thresholdKey = pickExistingKey(row, ['ExpenseAlertThresholdUsd', 'expense_alert_threshold_usd'])
      if (thresholdKey) payload[thresholdKey] = parseFloat(expThreshold) || 0

      const idKey = pickExistingKey(row, ['id', 'ID'])
      if (idKey && row[idKey] != null) {
        const { error } = await (supabase as any).from('tblInformation').update(payload).eq(idKey, row[idKey])
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('tblInformation').insert(payload)
        if (error) throw error
      }

      await log('settings_saved', 'Settings', 'Settings updated')
    },
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings'),
  })

  if (!isSup) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Access restricted — supervisors and admins only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base">System settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Owner WhatsApp number</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 96181278387" /></div>
            <div className="space-y-1.5"><Label>CallMeBot API key</Label><Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Get from CallMeBot — see instructions" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alert on void</Label>
                <Select value={alertVoid} onValueChange={setAlertVoid}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Alert on cash mismatch</Label>
                <Select value={alertMismatch} onValueChange={setAlertMismatch}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Alert on expense above (USD)</Label><Input type="number" value={expThreshold} onChange={e => setExpThreshold(e.target.value)} /></div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save settings'}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">How to activate WhatsApp alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Send this message on WhatsApp to <strong className="text-foreground">+34 644 59 72 87</strong>:</p>
            <div className="rounded bg-secondary px-3 py-2 font-mono text-xs">I allow callmebot to send me messages</div>
            <p>2. You will receive your API key back via WhatsApp.</p>
            <p>3. Paste the API key in the field above and save.</p>
            <p className="text-xs text-muted-foreground/70">CallMeBot is a free service. No registration needed.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
