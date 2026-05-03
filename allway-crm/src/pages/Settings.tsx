import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendWhatsApp } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/shared/Spinner'
import {
  MessageSquare,
  Bell,
  Shield,
  CheckCircle2,
  AlertCircle,
  Package,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react'

function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    if (row?.[k] !== undefined && row[k] !== null) return String(row[k])
  }
  return ''
}

export default function Settings() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const role = useRole()
  const { log } = useAuditLog()
  const isAdmin = role === 'admin'

  const [phone, setPhone] = useState('')
  const [shiftSummaryEnabled, setShiftSummaryEnabled] = useState('1')
  const [dailyReportEnabled, setDailyReportEnabled] = useState('0')
  const [alertVoid, setAlertVoid] = useState('1')
  const [alertMismatch, setAlertMismatch] = useState('1')
  const [expThreshold, setExpThreshold] = useState('50')
  const [stockCashBalance, setStockCashBalance] = useState('7339.33')
  const [hourlyRate, setHourlyRate] = useState('2.50')
  const [cashDrawerStation, setCashDrawerStation] = useState('')
  const [balanceIntervalHours, setBalanceIntervalHours] = useState('2')

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
    setAlertVoid(pick(row, ['AlertOnVoid', 'alert_on_void']) || '1')
    setAlertMismatch(pick(row, ['AlertOnCashMismatch', 'alert_on_cash_mismatch']) || '1')
    setExpThreshold(pick(row, ['ExpenseAlertThresholdUsd', 'expense_alert_threshold_usd']) || '50')
    setStockCashBalance(String(row?.StockCashBalance ?? '7339.33'))
    setHourlyRate(pick(row, ['HourlyRate', 'hourly_rate']) || '2.50')
    setCashDrawerStation(pick(row, ['CashDrawerStation', 'cash_drawer_station']) || '')
    setBalanceIntervalHours(pick(row, ['BalanceIntervalHours', 'balance_interval_hours']) || '2')
    const sse = row?.['ShiftSummaryEnabled'] ?? row?.['shift_summary_enabled']
    setShiftSummaryEnabled(sse === false ? '0' : '1')
    const dre = row?.['DailyReportEnabled'] ?? row?.['daily_report_enabled']
    setDailyReportEnabled(dre === true ? '1' : '0')
  }, [infoQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const row = infoQuery.data as any

      const corePayload: Record<string, unknown> = {
        OwnerWhatsapp: phone.trim(),
        AlertOnVoid: alertVoid === '1',
        AlertOnCashMismatch: alertMismatch === '1',
        ExpenseAlertThresholdUsd: parseFloat(expThreshold) || 50,
        ShiftSummaryEnabled: shiftSummaryEnabled === '1',
        DailyReportEnabled: dailyReportEnabled === '1',
        StockCashBalance: parseFloat(stockCashBalance) || 0,
      }

      if (row?.ID) {
        const { error } = await (supabase as any).from('tblInformation').update(corePayload).eq('ID', row.ID)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('tblInformation').insert(corePayload)
        if (error) throw error
      }

      if (row?.ID) {
        await (supabase as any).from('tblInformation').update({
          HourlyRate: parseFloat(hourlyRate) || 2.50,
          CashDrawerStation: cashDrawerStation.trim(),
          BalanceIntervalHours: parseInt(balanceIntervalHours) || 2,
        }).eq('ID', row.ID).then(({ error }: any) => {
          if (error && !error.message?.includes('column')) throw error
        })
      }

      localStorage.setItem('aw_hourly_rate', hourlyRate)
      localStorage.setItem('aw_cash_drawer_station', cashDrawerStation)
      localStorage.setItem('aw_balance_interval_hours', balanceIntervalHours)

      await log('settings_saved', 'Settings', `Settings updated by ${profile?.name}`)
    },
    onSuccess: () => {
      toast.success('Settings saved')
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
      void queryClient.invalidateQueries({ queryKey: ['settings', 'stock_cash'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings'),
  })

  const testWhatsAppMutation = useMutation({
    mutationFn: async () => {
      if (!phone.trim()) throw new Error('Enter a WhatsApp number first')
      const ok = await sendWhatsApp(phone.trim(), '', `✅ Test message from AllWay CRM\n${new Date().toLocaleString('en-GB')}`)
      if (!ok) throw new Error('Green API not configured — add VITE_GREEN_API_INSTANCE_ID and VITE_GREEN_API_TOKEN to your Vercel environment variables')
    },
    onSuccess: () => toast.success('Test WhatsApp sent!'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <div className="flex flex-col border-b pb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Config Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">System Settings</h1>
        </div>
        <div className="p-8 rounded-3xl border-2 border-dashed flex items-center gap-4">
          <AlertCircle className="w-8 h-8 text-destructive opacity-30" />
          <div>
            <p className="font-black text-lg uppercase tracking-tight">Access Restricted</p>
            <p className="text-sm text-muted-foreground font-medium">Admin access required.</p>
          </div>
        </div>
      </div>
    )
  }

  if (infoQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!infoQuery.data && !infoQuery.isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <div className="flex flex-col border-b pb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Config Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">System Settings</h1>
        </div>
        <div className="p-8 rounded-3xl border-2 border-amber-200 bg-amber-50/50 flex gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase text-amber-900">Settings Table Not Found</p>
            <p className="text-sm text-amber-700 font-medium mt-1">Run the SQL migration in your Supabase SQL Editor to enable settings.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-500 shadow-[0_0_8px_theme(colors.slate.400)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Config Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">System Settings</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Configure notifications, alerts, and business preferences.</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="h-12 bg-slate-800 hover:bg-slate-900 text-white font-black px-8 rounded-2xl shadow-xl shadow-slate-800/20 gap-2"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />SAVING...</> : 'SAVE ALL SETTINGS'}
        </Button>
      </div>

      {/* WhatsApp Section */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-emerald-600 text-white flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-2xl">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight italic">WhatsApp Configuration</h2>
            <p className="text-emerald-100 text-sm font-medium">
              Notifications via{' '}
              <Badge className="text-[9px] bg-white/20 text-white border-white/30 font-black uppercase">
                {(import.meta.env.VITE_WA_PROVIDER as string) || 'green-api'}
              </Badge>
            </p>
          </div>
        </div>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Owner WhatsApp Number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+96181XXXXXX"
              className="h-12 border-2 font-bold"
            />
            <p className="text-xs text-muted-foreground font-medium ml-1">Include country code. This number receives all shift and daily summaries.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => testWhatsAppMutation.mutate()}
              disabled={testWhatsAppMutation.isPending}
              className="h-10 border-2 font-black rounded-xl gap-2"
            >
              {testWhatsAppMutation.isPending ? <><Spinner size="xs" className="mr-1.5 opacity-70" />Sending...</> : 'Send Test Message'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications & Reports */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-amber-500 text-black flex items-center gap-3">
          <div className="p-2.5 bg-black/10 rounded-2xl">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black uppercase tracking-tight italic">Notifications & Reports</h2>
              <Badge className="text-[9px] bg-black/20 text-black border-black/20 font-black uppercase">Admin Only</Badge>
            </div>
            <p className="text-amber-900/70 text-sm font-medium">Control which automated summaries are sent and when.</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-3">
          {[
            {
              label: 'Shift-end WhatsApp summary',
              desc: 'Sends a rich shift report (start/end time, sales, cash reconciliation, top items) to the owner every time a staff member closes their shift.',
              val: shiftSummaryEnabled,
              set: setShiftSummaryEnabled,
            },
            {
              label: 'End-of-day WhatsApp summary',
              desc: 'Sends a daily totals summary to the owner WhatsApp when Close Day is triggered by an admin.',
              val: dailyReportEnabled,
              set: setDailyReportEnabled,
            },
          ].map(({ label, desc, val, set }) => (
            <div
              key={label}
              className={`flex items-start justify-between gap-4 p-4 rounded-2xl border-2 transition-all ${val === '1' ? 'border-emerald-200 bg-emerald-50/50' : 'border-border'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {val === '1'
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground shrink-0" />
                  }
                  <p className="text-sm font-black uppercase tracking-tight">{label}</p>
                </div>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed ml-5">{desc}</p>
              </div>
              <Select value={val} onValueChange={set}>
                <SelectTrigger className={`w-20 shrink-0 font-black text-xs border-2 rounded-xl ${val === '1' ? 'border-emerald-300 text-emerald-700' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1" className="text-emerald-700 font-black">ON</SelectItem>
                  <SelectItem value="0" className="text-muted-foreground font-bold">OFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Alert Thresholds */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-secondary/30 border-b flex items-center gap-3">
          <div className="p-2.5 bg-background rounded-2xl border-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight italic">Alert Thresholds</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Configure when automatic alerts are triggered</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Alert on Void Request</Label>
              <Select value={alertVoid} onValueChange={setAlertVoid}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Yes — notify owner</SelectItem>
                  <SelectItem value="0">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Alert on Cash Mismatch</Label>
              <Select value={alertMismatch} onValueChange={setAlertMismatch}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Yes — notify owner</SelectItem>
                  <SelectItem value="0">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Large Expense Alert Threshold (USD)</Label>
            <div className="relative w-40">
              <span className="absolute left-4 top-3.5 text-muted-foreground font-mono font-black">$</span>
              <Input
                type="number"
                value={expThreshold}
                onChange={(e) => setExpThreshold(e.target.value)}
                className="h-12 pl-8 border-2 font-mono font-bold"
              />
            </div>
            <p className="text-xs text-muted-foreground font-medium ml-1">Expenses above this amount trigger a warning when submitted.</p>
          </div>
        </CardContent>
      </Card>

      {/* Stock Cash Balance */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-secondary/30 border-b flex items-center gap-3">
          <div className="p-2.5 bg-background rounded-2xl border-2">
            <Package className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight italic">Stock Cash Balance</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cash side of total stock value from Access system</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground font-medium">
            Combined with physical inventory cost this produces the total stock value shown on the dashboard. Update this after each Access sync.
          </p>
          <div className="flex items-center gap-4">
            <div className="relative w-44">
              <span className="absolute left-4 top-3.5 text-muted-foreground font-mono font-black">$</span>
              <Input
                type="number"
                step="0.01"
                value={stockCashBalance}
                onChange={(e) => setStockCashBalance(e.target.value)}
                className="h-12 pl-8 border-2 font-mono font-black"
              />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Access value: <span className="font-mono font-black">$7,339.33</span> (as of May 1 2026)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Payroll & Operations */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-indigo-600 text-white flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-2xl">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black uppercase tracking-tight italic">Payroll & Operations</h2>
              <Badge className="text-[9px] bg-black/20 text-white border-black/20 font-black uppercase">Admin Only</Badge>
            </div>
            <p className="text-indigo-100 text-sm font-medium">Employee salary rates, cash drawer, and balance check intervals.</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Hourly Rate (USD)</Label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-muted-foreground font-mono font-black">$</span>
                <Input type="number" step="0.25" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className="h-12 pl-8 border-2 font-mono font-bold" />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium ml-1">Used in Payroll to calculate monthly salary per employee.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Balance Check Interval (hours)</Label>
              <Input type="number" min="1" max="12" value={balanceIntervalHours} onChange={e => setBalanceIntervalHours(e.target.value)} className="h-12 border-2 font-mono font-bold" />
              <p className="text-[10px] text-muted-foreground font-medium ml-1">Alert shown on Dashboard if no balance check submitted within this window.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cash Drawer Station</Label>
            <Input value={cashDrawerStation} onChange={e => setCashDrawerStation(e.target.value)} placeholder="e.g. Main Station" className="h-12 border-2 font-bold" />
            <p className="text-[10px] text-muted-foreground font-medium ml-1">Only this station is required to submit the 2-hour balance check. Leave blank to require all stations.</p>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
