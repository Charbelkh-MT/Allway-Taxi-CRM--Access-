import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/utils'
import { useRole } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Users,
  Clock,
  DollarSign,
  ArrowUpRight,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  TrendingUp,
} from 'lucide-react'

function hoursWorked(openedAt: string, closedAt: string | null): number {
  if (!closedAt) return 0
  const diff = new Date(closedAt).getTime() - new Date(openedAt).getTime()
  return Math.max(0, diff / 3600000)
}

function monthLabel(y: number, m: number) {
  return new Date(y, m - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

export default function Payroll() {
  const role = useRole()
  const isAdmin = role === 'admin'

  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  // Load hourly rate: try DB column, fall back to localStorage, then default $2.50
  const lsRate = parseFloat(localStorage.getItem('aw_hourly_rate') ?? '') || 2.50
  const [hourlyRate, setHourlyRate] = useState<number>(lsRate)

  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('tblInformation').select('HourlyRate,hourly_rate').limit(1).single()
        .catch(() => ({ data: null }))
      const rate = parseFloat(data?.HourlyRate ?? data?.hourly_rate ?? '') || lsRate
      setHourlyRate(rate)
      return rate
    },
  })

  const shiftsQuery = useQuery({
    queryKey: ['payroll_shifts', selYear, selMonth],
    queryFn: async () => {
      const from = new Date(selYear, selMonth - 1, 1).toISOString()
      const to = new Date(selYear, selMonth, 1).toISOString()
      const { data, error } = await supabase
        .from('shifts')
        .select('user_name, station, opened_at, closed_at, status, difference_usd')
        .gte('opened_at', from)
        .lt('opened_at', to)
        .in('status', ['closed', 'flagged'])
        .order('opened_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const rate = hourlyRate ?? 2.50

  const employeeSummary = useMemo(() => {
    const shifts = (shiftsQuery.data ?? []) as any[]
    const map: Record<string, { name: string; station: string; shifts: number; hours: number; flagged: number }> = {}
    for (const s of shifts) {
      const key = s.user_name
      if (!map[key]) map[key] = { name: s.user_name, station: s.station || 'Unknown', shifts: 0, hours: 0, flagged: 0 }
      map[key].shifts++
      map[key].hours += hoursWorked(s.opened_at, s.closed_at)
      if (s.status === 'flagged') map[key].flagged++
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [shiftsQuery.data])

  const totals = useMemo(() => ({
    totalHours: employeeSummary.reduce((s, e) => s + e.hours, 0),
    totalPayroll: employeeSummary.reduce((s, e) => s + e.hours * rate, 0),
    headcount: employeeSummary.length,
  }), [employeeSummary, rate])

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i).toLocaleString('en-GB', { month: 'long' }) }))

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <div className="flex flex-col border-b pb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Payroll Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Payroll</h1>
        </div>
        <div className="p-8 rounded-3xl border-2 border-dashed flex items-center gap-4">
          <AlertCircle className="w-8 h-8 text-destructive opacity-30" />
          <div>
            <p className="font-black text-lg uppercase tracking-tight">Access Restricted</p>
            <p className="text-sm text-muted-foreground font-medium">Supervisors and admins only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_theme(colors.indigo.500)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Payroll Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Employee Payroll</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Monthly salary based on shift hours at ${rate.toFixed(2)}/hr.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Select value={String(selMonth)} onValueChange={v => setSelMonth(Number(v))}>
              <SelectTrigger className="w-36 h-12 border-2 rounded-2xl font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selYear)} onValueChange={v => setSelYear(Number(v))}>
              <SelectTrigger className="w-28 h-12 border-2 rounded-2xl font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="p-3 rounded-2xl border-2 bg-secondary/30 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Rate</p>
            <p className="font-mono font-black text-indigo-600">${rate.toFixed(2)}/hr</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Headcount', value: totals.headcount, icon: Users, color: 'text-indigo-600', sub: monthLabel(selYear, selMonth) },
          { label: 'Total Hours', value: totals.totalHours.toFixed(1) + 'h', icon: Clock, color: 'text-amber-600', sub: 'Across all employees' },
          { label: 'Total Payroll', value: fmtMoney(totals.totalPayroll), icon: DollarSign, color: 'text-emerald-600', sub: `At $${rate.toFixed(2)}/hr` },
          { label: 'Avg per Employee', value: totals.headcount ? fmtMoney(totals.totalPayroll / totals.headcount) : '$0.00', icon: TrendingUp, color: 'text-rose-600', sub: 'Monthly average' },
        ].map(s => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary"><s.icon className="w-4 h-4 text-muted-foreground" /></div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Employee Summary</CardTitle>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{monthLabel(selYear, selMonth)} · {employeeSummary.length} employees</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 text-[10px] font-black uppercase">Employee</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Shifts</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Hours Worked</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Salary ({monthLabel(selYear, selMonth)})</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Cash Flags</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shiftsQuery.isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-20 italic">Loading shift data...</TableCell></TableRow>
              )}
              {!shiftsQuery.isLoading && employeeSummary.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground">No closed shifts found for this period.</TableCell></TableRow>
              )}
              {employeeSummary.map(emp => {
                const salary = emp.hours * rate
                return (
                  <TableRow key={emp.name} className="hover:bg-secondary/10 transition-colors">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-indigo-100 flex items-center justify-center text-sm font-black text-indigo-700 border-2 border-indigo-200">
                          {emp.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-sm uppercase tracking-tight leading-none mb-0.5">{emp.name}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{emp.station}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-black text-sm">{emp.shifts}</TableCell>
                    <TableCell className="text-right font-mono font-black text-sm text-amber-600">
                      {emp.hours.toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right font-mono font-black text-lg text-emerald-600">
                      {fmtMoney(salary)}
                    </TableCell>
                    <TableCell className="text-center">
                      {emp.flagged > 0 ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-black text-[9px]">
                          {emp.flagged} {emp.flagged === 1 ? 'flag' : 'flags'}
                        </Badge>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="text-[9px] font-black uppercase">Clean</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-black text-[9px] uppercase">
                        {emp.shifts} shift{emp.shifts !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}

              {/* Totals row */}
              {employeeSummary.length > 0 && (
                <TableRow className="bg-secondary/20 border-t-2">
                  <TableCell className="pl-6 font-black text-sm uppercase tracking-wide">TOTAL</TableCell>
                  <TableCell className="text-center font-mono font-black text-sm">
                    {employeeSummary.reduce((s, e) => s + e.shifts, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-sm text-amber-600">
                    {totals.totalHours.toFixed(1)}h
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-lg text-emerald-600">
                    {fmtMoney(totals.totalPayroll)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Individual shift breakdown */}
      {employeeSummary.length > 0 && (
        <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
          <CardHeader className="bg-secondary/30 pb-6 border-b">
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Shift-by-Shift Log</CardTitle>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Detailed hours per session</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="aw-table">
              <TableHeader className="bg-secondary/20">
                <TableRow className="hover:bg-transparent border-b-2">
                  <TableHead className="pl-6 text-[10px] font-black uppercase">Employee</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Opened</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Closed</TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase">Hours</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase">Pay</TableHead>
                  <TableHead className="text-center pr-6 text-[10px] font-black uppercase">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(shiftsQuery.data ?? []).map((s: any, i: number) => {
                  const hrs = hoursWorked(s.opened_at, s.closed_at)
                  const pay = hrs * rate
                  return (
                    <TableRow key={i} className="hover:bg-secondary/10 transition-colors">
                      <TableCell className="pl-6 font-black text-sm uppercase">{s.user_name}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground font-bold">
                        {new Date(s.opened_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground font-bold">
                        {s.closed_at ? new Date(s.closed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </TableCell>
                      <TableCell className="text-center font-mono font-black text-amber-600">{hrs.toFixed(2)}h</TableCell>
                      <TableCell className="text-right font-mono font-black text-emerald-600">{fmtMoney(pay)}</TableCell>
                      <TableCell className="text-center pr-6">
                        {s.status === 'flagged'
                          ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] font-black">Flagged</Badge>
                          : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-black">Closed</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
