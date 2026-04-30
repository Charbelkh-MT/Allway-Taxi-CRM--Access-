import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendEmail, sendWhatsApp } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare, Mail, Bell, Shield, CheckCircle2,
  ExternalLink, AlertCircle, Eye, EyeOff,
} from 'lucide-react'

// Helper to read a field from tblInformation handling multiple name variants
function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    if (row?.[k] !== undefined && row[k] !== null) return String(row[k])
  }
  return ''
}

export default function Settings() {
  const { profile } = useAuth()
  const role = useRole()
  const { log } = useAuditLog()
  const isSup   = role === 'admin' || role === 'supervisor'
  const isAdmin = role === 'admin'

  // WhatsApp settings
  const [phone,    setPhone]    = useState('')
  const [apiKey,   setApiKey]   = useState('')
  const [showKey,  setShowKey]  = useState(false)

  // Email settings
  const [ownerEmail, setOwnerEmail] = useState('')
  const [resendKey,  setResendKey]  = useState('')
  const [showResend, setShowResend] = useState(false)

  // Notification toggles (admin only)
  const [shiftSummaryEnabled,  setShiftSummaryEnabled]  = useState('1')
  const [dailyReportEnabled,   setDailyReportEnabled]   = useState('0')
  const [dailyEmailEnabled,    setDailyEmailEnabled]    = useState('0')

  // Alert thresholds
  const [alertVoid,      setAlertVoid]      = useState('1')
  const [alertMismatch,  setAlertMismatch]  = useState('1')
  const [expThreshold,   setExpThreshold]   = useState('50')

  const infoQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('tblInformation').select('*').limit(1).single()
      return data
    },
  })

  useEffect(() => {
    const row = infoQuery.data
    if (!row) return
    setPhone(pick(row, ['OwnerWhatsapp', 'owner_whatsapp']))
    setApiKey(pick(row, ['CallMeBotApiKey', 'callmebot_api_key', 'WhatsappApiKey']))
    setOwnerEmail(pick(row, ['OwnerEmail', 'owner_email']))
    setAlertVoid(pick(row, ['AlertOnVoid', 'alert_on_void']) || '1')
    setAlertMismatch(pick(row, ['AlertOnCashMismatch', 'alert_on_cash_mismatch']) || '1')
    setExpThreshold(pick(row, ['ExpenseAlertThresholdUsd', 'expense_alert_threshold_usd']) || '50')
    const sse = row?.['ShiftSummaryEnabled'] ?? row?.['shift_summary_enabled']
    setShiftSummaryEnabled(sse === false ? '0' : '1')
    const dre = row?.['DailyReportEnabled'] ?? row?.['daily_report_enabled']
    setDailyReportEnabled(dre === true ? '1' : '0')
    const dee = row?.['DailyEmailEnabled'] ?? row?.['daily_email_enabled']
    setDailyEmailEnabled(dee === true ? '1' : '0')
  }, [infoQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const row = infoQuery.data as any
      const payload: Record<string, unknown> = {
        OwnerWhatsapp:             phone.trim(),
        CallMeBotApiKey:           apiKey.trim(),
        OwnerEmail:                ownerEmail.trim(),
        AlertOnVoid:               alertVoid === '1',
        AlertOnCashMismatch:       alertMismatch === '1',
        ExpenseAlertThresholdUsd:  parseFloat(expThreshold) || 50,
        ShiftSummaryEnabled:       shiftSummaryEnabled === '1',
        DailyReportEnabled:        dailyReportEnabled === '1',
        DailyEmailEnabled:         dailyEmailEnabled === '1',
      }
      if (row?.ID) {
        const { error } = await (supabase as any).from('tblInformation').update(payload).eq('ID', row.ID)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('tblInformation').insert(payload)
        if (error) throw error
      }
      await log('settings_saved', 'Settings', `Settings updated by ${profile?.name}`)
    },
    onSuccess: () => toast.success('Settings saved'),
    onError:   (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings'),
  })

  const testWhatsAppMutation = useMutation({
    mutationFn: async () => {
      if (!phone.trim()) throw new Error('Enter a WhatsApp number first')
      const ok = await sendWhatsApp(phone.trim(), apiKey.trim(),
        `✅ Test message from AllWay CRM\n${new Date().toLocaleString('en-GB')}`)
      if (!ok) throw new Error('WhatsApp not configured — check .env VITE_WA_PROVIDER and credentials')
    },
    onSuccess: () => toast.success('Test WhatsApp sent!'),
    onError:   (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      if (!ownerEmail.trim()) throw new Error('Enter an email address first')
      const ok = await sendEmail(ownerEmail.trim(), 'AllWay CRM — Test Email',
        '<h2>Test email from AllWay CRM</h2><p>Email notifications are working correctly.</p>')
      if (!ok) throw new Error('Email not configured — check .env VITE_RESEND_API_KEY')
    },
    onSuccess: () => toast.success('Test email sent!'),
    onError:   (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  if (!isSup) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Access restricted — supervisors and admins only.</p>
      </div>
    )
  }

  if (infoQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!infoQuery.data && !infoQuery.isLoading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-5 h-5" />
              <p className="font-semibold">Settings table not yet created</p>
            </div>
            <p className="text-sm text-amber-700">
              Run the SQL migration in your Supabase SQL Editor to enable settings.
              The SQL is shown in the IMPLEMENTATION_PLAN.md file.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure notifications, alerts and business preferences.</p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? 'Saving...' : 'Save all settings'}
        </Button>
      </div>

      {/* ── Section 1: WhatsApp ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <CardTitle className="text-base">WhatsApp Configuration</CardTitle>
          </div>
          <CardDescription>
            Notifications are sent via{' '}
            <Badge variant="secondary" className="text-[10px]">
              {(import.meta.env.VITE_WA_PROVIDER as string) || 'callmebot'}
            </Badge>
            {' '}— change provider in your .env file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Owner WhatsApp number</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+96181XXXXXX" />
            <p className="text-xs text-muted-foreground">Include country code. This number receives all shift and daily summaries.</p>
          </div>
          <div className="space-y-1.5">
            <Label>CallMeBot API key <span className="text-xs text-muted-foreground">(only needed if using CallMeBot provider)</span></Label>
            <div className="flex gap-2">
              <Input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Get from CallMeBot" className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => setShowKey(v => !v)}>{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => testWhatsAppMutation.mutate()} disabled={testWhatsAppMutation.isPending} className="gap-2">
              {testWhatsAppMutation.isPending ? 'Sending...' : 'Send test message'}
            </Button>
            <a href="https://green-api.com" target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
              Get Green API <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Email ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            <CardTitle className="text-base">Email Configuration</CardTitle>
          </div>
          <CardDescription>End-of-day reports are sent via Resend. Requires a verified sender domain.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Owner email address</Label>
            <Input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Resend API key <span className="text-xs text-muted-foreground">(set in .env as VITE_RESEND_API_KEY)</span></Label>
            <div className="flex gap-2">
              <Input type={showResend ? 'text' : 'password'} value={resendKey} onChange={e => setResendKey(e.target.value)} placeholder="re_xxxxxxxxxxxx  (stored in .env, not DB)" className="flex-1 opacity-60" readOnly />
              <Button variant="ghost" size="icon" onClick={() => setShowResend(v => !v)}>{showResend ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
            </div>
            <p className="text-xs text-muted-foreground">API key is stored in the server .env file for security, not in the database.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => testEmailMutation.mutate()} disabled={testEmailMutation.isPending} className="gap-2">
              {testEmailMutation.isPending ? 'Sending...' : 'Send test email'}
            </Button>
            <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
              Get Resend API key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Notification Toggles (admin only) ── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <CardTitle className="text-base">Notifications & Reports</CardTitle>
              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Admin only</Badge>
            </div>
            <CardDescription>Control which automated summaries are sent and when.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: 'Shift-end WhatsApp summary',
                desc:  'Sends a rich shift report (start/end time, sales, cash reconciliation, top items) to the owner every time a staff member closes their shift.',
                val:   shiftSummaryEnabled,
                set:   setShiftSummaryEnabled,
              },
              {
                label: 'End-of-day WhatsApp summary',
                desc:  'Sends a daily totals summary to the owner WhatsApp when Close Day is triggered by a supervisor.',
                val:   dailyReportEnabled,
                set:   setDailyReportEnabled,
              },
              {
                label: 'End-of-day full email report',
                desc:  'Sends a complete HTML report (all invoices, expenses, Whish, shifts) to the owner email on Close Day. Requires Resend API key + owner email above.',
                val:   dailyEmailEnabled,
                set:   setDailyEmailEnabled,
              },
            ].map(({ label, desc, val, set }) => (
              <div key={label} className={`flex items-start justify-between gap-4 p-3.5 rounded-xl border-2 transition-colors ${val === '1' ? 'border-green-200 bg-green-50/50' : 'border-border'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {val === '1'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground shrink-0" />
                    }
                    <p className="text-sm font-semibold">{label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground ml-5.5 leading-relaxed">{desc}</p>
                </div>
                <Select value={val} onValueChange={set}>
                  <SelectTrigger className={`w-20 shrink-0 font-bold text-xs ${val === '1' ? 'border-green-300 text-green-700' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1" className="text-green-700 font-bold">ON</SelectItem>
                    <SelectItem value="0" className="text-muted-foreground">OFF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Section 4: Alert Thresholds ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Alert Thresholds</CardTitle>
          </div>
          <CardDescription>Configure when automatic alerts are triggered.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Alert on void request</Label>
              <Select value={alertVoid} onValueChange={setAlertVoid}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Yes — notify owner</SelectItem>
                  <SelectItem value="0">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Alert on cash mismatch</Label>
              <Select value={alertMismatch} onValueChange={setAlertMismatch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Yes — notify owner</SelectItem>
                  <SelectItem value="0">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Large expense alert threshold (USD)</Label>
            <Input type="number" value={expThreshold} onChange={e => setExpThreshold(e.target.value)} className="w-32" />
            <p className="text-xs text-muted-foreground">Expenses above this amount trigger a warning when submitted.</p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ── CallMeBot setup guide ── */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">How to activate WhatsApp (Green API — Recommended)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Go to <a href="https://green-api.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">green-api.com</a> → create a free account</p>
          <p>2. Create a new instance → scan the QR code with the <strong>owner's WhatsApp</strong></p>
          <p>3. Copy the <code className="bg-secondary px-1 rounded text-xs">instanceId</code> and <code className="bg-secondary px-1 rounded text-xs">apiToken</code></p>
          <p>4. Add to your <code className="bg-secondary px-1 rounded text-xs">.env</code> file:</p>
          <pre className="bg-secondary rounded p-3 text-xs overflow-x-auto">
{`VITE_WA_PROVIDER=green-api
VITE_GREEN_API_INSTANCE_ID=your_instance_id
VITE_GREEN_API_TOKEN=your_token`}
          </pre>
          <p>5. Redeploy → click "Send test message" above to verify</p>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-4">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="lg">
          {saveMutation.isPending ? 'Saving...' : 'Save all settings'}
        </Button>
      </div>
    </div>
  )
}
