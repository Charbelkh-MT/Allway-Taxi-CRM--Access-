import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  Search,
  Download,
  RefreshCw,
  Activity,
  User as UserIcon,
  Clock,
  AlertTriangle,
  XCircle,
  LogIn,
  DollarSign,
  Package,
  ShoppingCart,
  Globe,
  Car,
  ArrowUpRight,
  Filter,
} from 'lucide-react'

const MODULES = ['sale', 'void', 'login', 'expense', 'flag', 'whish', 'shift', 'inventory', 'recharge', 'internet', 'taxi', 'client', 'product', 'purchase']

export default function Audit() {
  const queryClient = useQueryClient()
  const [moduleFilter, setModuleFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [search, setSearch] = useState('')

  const logsQuery = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = (logsQuery.data ?? []) as any[]
    const today = new Date().toISOString().split('T')[0]
    const todayLogs = data.filter((r) => r.created_at.startsWith(today))
    const criticalFlags = todayLogs.filter((r) => r.module === 'flag' || r.module === 'void').length
    const uniqueUsers = new Set(todayLogs.map((r) => r.user_name)).size
    return { todayCount: todayLogs.length, criticalFlags, uniqueUsers, totalEntries: data.length }
  }, [logsQuery.data])

  const users = useMemo(() => [...new Set((logsQuery.data ?? []).map((r: any) => r.user_name))].sort(), [logsQuery.data])

  const filtered = useMemo(() => {
    let rows = (logsQuery.data ?? []) as any[]
    if (moduleFilter !== 'all') rows = rows.filter((r) => r.module === moduleFilter)
    if (userFilter !== 'all') rows = rows.filter((r) => r.user_name === userFilter)
    if (search.trim()) {
      const s = search.toLowerCase()
      rows = rows.filter((r) => (r.detail ?? '').toLowerCase().includes(s) || (r.action ?? '').toLowerCase().includes(s) || (r.user_name ?? '').toLowerCase().includes(s))
    }
    return rows
  }, [logsQuery.data, moduleFilter, userFilter, search])

  function exportCsv() {
    const headers = ['ID', 'Date', 'Action', 'Module', 'Detail', 'User', 'Station']
    const rows = filtered.map((r: any) =>
      [r.id, r.created_at, r.action, r.module, `"${(r.detail ?? '').replace(/"/g, '""')}"`, r.user_name, r.station].join(','),
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'sale': return <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
      case 'void': return <XCircle className="w-3.5 h-3.5 text-destructive" />
      case 'login': return <LogIn className="w-3.5 h-3.5 text-blue-600" />
      case 'expense': return <DollarSign className="w-3.5 h-3.5 text-orange-600" />
      case 'flag': return <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
      case 'whish': return <Activity className="w-3.5 h-3.5 text-purple-600" />
      case 'shift': return <Clock className="w-3.5 h-3.5 text-indigo-600" />
      case 'inventory': return <Package className="w-3.5 h-3.5 text-cyan-600" />
      case 'recharge': return <Activity className="w-3.5 h-3.5 text-rose-600" />
      case 'internet': return <Globe className="w-3.5 h-3.5 text-sky-600" />
      case 'taxi': return <Car className="w-3.5 h-3.5 text-yellow-600" />
      default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />
    }
  }

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'sale': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'void': return 'bg-red-100 text-red-700 border-red-200'
      case 'login': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'expense': return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'flag': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'whish': return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'shift': return 'bg-indigo-100 text-indigo-700 border-indigo-200'
      case 'taxi': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      default: return 'bg-secondary/50 text-muted-foreground border-border'
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_theme(colors.violet.500)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Security Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">System Audit Log</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Real-time tracking of all critical system activities and user actions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['audit_log'] })}
            className="h-12 border-2 font-black px-6 rounded-2xl gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            REFRESH
          </Button>
          <Button
            onClick={exportCsv}
            className="h-12 bg-violet-600 hover:bg-violet-700 text-white font-black px-8 rounded-2xl shadow-xl shadow-violet-600/20 gap-2"
          >
            <Download className="w-4 h-4" />
            EXPORT CSV
          </Button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Actions Today', value: stats.todayCount, icon: Activity, color: 'text-violet-600', sub: 'System Events' },
          { label: 'Critical Flags', value: stats.criticalFlags, icon: AlertTriangle, color: 'text-destructive', sub: 'Voids & Flags' },
          { label: 'Active Staff', value: stats.uniqueUsers, icon: UserIcon, color: 'text-blue-600', sub: 'Users Today' },
          { label: 'Total Entries', value: stats.totalEntries, icon: Shield, color: 'text-emerald-600', sub: 'All Records' },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary">
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Audit Table */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight italic">Event Stream</CardTitle>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Global Activity Log · {filtered.length} entries</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search logs..."
                  className="pl-10 h-10 border-2 rounded-xl text-xs font-bold"
                />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-40 h-10 border-2 rounded-xl font-bold text-xs">
                  <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-40 h-10 border-2 rounded-xl font-bold text-xs">
                  <UserIcon className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 w-[180px] text-[10px] font-black uppercase">Timestamp</TableHead>
                <TableHead className="w-[40px] text-[10px] font-black uppercase"></TableHead>
                <TableHead className="text-[10px] font-black uppercase">Log Details</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">User</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Station</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 italic">Syncing system logs...</TableCell>
                </TableRow>
              )}
              {!logsQuery.isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No audit entries found matching the criteria.</TableCell>
                </TableRow>
              )}
              {filtered.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-secondary/10 transition-colors border-l-4 border-l-transparent hover:border-l-violet-400 group">
                  <TableCell className="pl-6 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      {fmtDateTime(r.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center px-0">
                    <div className="p-1.5 bg-secondary/50 rounded-xl inline-block">
                      {getModuleIcon(r.module)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-sm text-foreground">{r.detail || r.action}</span>
                      <Badge variant="outline" className={`w-fit text-[9px] uppercase tracking-widest px-2 py-0 h-4 font-black border ${getModuleColor(r.module)}`}>
                        {r.module}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-black text-violet-700 border-2 border-violet-200">
                        {r.user_name?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-black font-mono tracking-tighter">{r.user_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Badge variant="secondary" className="font-mono text-[9px] font-black uppercase tracking-wider">
                      {r.station || 'ROOT'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
