import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Search, 
  Download, 
  RefreshCw, 
  Activity, 
  User as UserIcon, 
  Layout, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  LogIn,
  DollarSign,
  Package,
  ShoppingCart,
  Globe,
  Car,
  Filter
} from 'lucide-react'

const MODULES = ['sale','void','login','expense','flag','whish','shift','inventory','recharge','internet','taxi','client','product','purchase']

export default function Audit() {
  const queryClient = useQueryClient()
  const [moduleFilter, setModuleFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')

  const logsQuery = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = logsQuery.data ?? []
    const today = new Date().toISOString().split('T')[0]
    const todayLogs = data.filter(r => r.created_at.startsWith(today))
    const criticalFlags = todayLogs.filter(r => r.module === 'flag' || r.module === 'void').length
    const uniqueUsers = new Set(todayLogs.map(r => r.user_name)).size
    
    return {
      todayCount: todayLogs.length,
      criticalFlags,
      uniqueUsers
    }
  }, [logsQuery.data])

  const users = useMemo(() => [...new Set((logsQuery.data ?? []).map((r: any) => r.user_name))].sort(), [logsQuery.data])

  const filtered = useMemo(() => {
    let rows = logsQuery.data ?? []
    if (moduleFilter !== 'all') rows = rows.filter((r: any) => r.module === moduleFilter)
    if (userFilter !== 'all') rows = rows.filter((r: any) => r.user_name === userFilter)
    return rows
  }, [logsQuery.data, moduleFilter, userFilter])

  function exportCsv() {
    const headers = ['ID', 'Date', 'Action', 'Module', 'Detail', 'User', 'Station']
    const rows = filtered.map((r: any) => [r.id, r.created_at, r.action, r.module, `"${(r.detail ?? '').replace(/"/g, '""')}"`, r.user_name, r.station].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'sale': return <ShoppingCart className="w-3.5 h-3.5 text-green-600" />
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            System Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time tracking of all critical system activities and user actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['audit_log'] })} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Actions Today</p>
              <p className="text-2xl font-bold font-mono">{stats.todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-destructive/10 rounded-xl text-destructive">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Critical Flags</p>
              <p className="text-2xl font-bold font-mono text-destructive">{stats.criticalFlags}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Active Staff</p>
              <p className="text-2xl font-bold font-mono text-blue-600">{stats.uniqueUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 shadow-sm overflow-hidden bg-background">
        <div className="p-4 border-b bg-secondary/10 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground mr-2">
            <Filter className="w-4 h-4" />
            Filters
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[180px] h-9 bg-white shadow-sm">
              <Layout className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {MODULES.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[180px] h-9 bg-white shadow-sm">
              <UserIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          
          <div className="ml-auto text-xs font-mono text-muted-foreground italic">
            Showing last {filtered.length} entries
          </div>
        </div>

        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow>
              <TableHead className="w-[180px] font-bold">Timestamp</TableHead>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="font-bold">Log Details</TableHead>
              <TableHead className="font-bold text-center">User</TableHead>
              <TableHead className="font-bold text-right">Station</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">Syncing system logs...</TableCell></TableRow>}
            {!logsQuery.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No audit entries found matching the criteria.</TableCell></TableRow>}
            {filtered.map((r: any) => (
              <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors border-l-4 border-l-transparent hover:border-l-primary/40">
                <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {fmtDateTime(r.created_at)}
                  </div>
                </TableCell>
                <TableCell className="text-center px-0">
                  <div className="p-1.5 bg-secondary/50 rounded-lg inline-block">
                    {getModuleIcon(r.module)}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{r.detail || r.action}</span>
                    <Badge variant="outline" className="w-fit text-[9px] uppercase tracking-tighter px-1 py-0 h-4 font-bold bg-secondary/30">
                      {r.module}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {r.user_name?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-bold font-mono tracking-tighter">{r.user_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono text-[10px] bg-secondary/50">
                    {r.station || 'ROOT'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
