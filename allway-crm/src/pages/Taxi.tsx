import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney, normalizeMoney, today } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetFooter,
} from '@/components/ui/sheet'
import { MethodBadge, UserBadge } from '@/components/shared/Badges'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { Spinner } from '@/components/shared/Spinner'
import {
  Car,
  Plus,
  TrendingUp,
  MapPin,
  Calendar,
  CreditCard,
  Search,
  User,
  ArrowUpRight,
  PlusCircle,
  Pencil,
} from 'lucide-react'

const QK = ['taxi_trips']

export default function Taxi() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  const [tripSheetOpen, setTripSheetOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<any>(null)
  const [driver, setDriver] = useState('')
  const [tripDate, setTripDate] = useState(today())
  const [usd, setUsd] = useState('0')
  const [lbp, setLbp] = useState('0')
  const [method, setMethod] = useState('Cash')
  const [route, setRoute] = useState('')
  const [search, setSearch] = useState('')

  const tripsQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('taxi_trips').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = (tripsQuery.data ?? []) as any[]
    const day = today()
    const todayTrips = data.filter((t) => t.trip_date === day)
    const revenueUsd = todayTrips.reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0)
    const revenueLbp = todayTrips.reduce((sum, t) => sum + (parseFloat(t.amount_lbp) || 0), 0)
    const driverCounts: Record<string, number> = {}
    todayTrips.forEach((t) => {
      driverCounts[t.driver_name] = (driverCounts[t.driver_name] || 0) + 1
    })
    const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None'
    const totalTrips = data.length
    return { todayCount: todayTrips.length, revenueUsd, revenueLbp, topDriver, totalTrips }
  }, [tripsQuery.data])

  const filteredTrips = useMemo(() => {
    const data = (tripsQuery.data ?? []) as any[]
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter((t) => t.driver_name.toLowerCase().includes(s) || t.route?.toLowerCase().includes(s))
  }, [tripsQuery.data, search])

  function handleEdit(r: any) {
    setEditingTrip(r)
    setDriver(r.driver_name)
    setTripDate(r.trip_date)
    setUsd(String(normalizeMoney(r.amount_usd, 'USD')))
    setLbp(String(normalizeMoney(r.amount_lbp, 'LBP')))
    setMethod(r.payment_method)
    setRoute(r.route || '')
    setTripSheetOpen(true)
  }

  function resetForm() {
    setEditingTrip(null)
    setDriver('')
    setUsd('0')
    setLbp('0')
    setRoute('')
    setTripDate(today())
    setMethod('Cash')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!driver.trim()) throw new Error('Driver name is required')
      if (parseFloat(usd) <= 0 && parseInt(lbp) <= 0) throw new Error('Please enter a trip amount')
      const payload = {
        driver_name: driver.trim(),
        trip_date: tripDate,
        amount_usd: parseFloat(usd) || 0,
        amount_lbp: parseInt(lbp) || 0,
        payment_method: method,
        route: route.trim(),
        created_by: profile?.name ?? 'system',
      }
      if (editingTrip) {
        const { error } = await (supabase as any).from('taxi_trips').update(payload).eq('id', editingTrip.id)
        if (error) throw error
        await log('taxi_trip_edited', 'Taxi', `Trip updated — driver ${driver.trim()} (#${editingTrip.id})`)
      } else {
        const { error } = await (supabase as any).from('taxi_trips').insert(payload)
        if (error) throw error
        await log('taxi_trip', 'Taxi', `Trip logged — driver ${driver.trim()} — $${usd}`)
      }
    },
    onSuccess: () => {
      toast.success(editingTrip ? 'Trip record updated' : 'Taxi trip logged successfully')
      void queryClient.invalidateQueries({ queryKey: QK })
      resetForm()
      setTripSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save trip'),
  })

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_theme(colors.amber.500)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">Taxi Module</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">Dispatch Ledger</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Manage driver trips, routes, and revenue collection.</p>
        </div>
        <Button
          onClick={() => { resetForm(); setTripSheetOpen(true) }}
          className="h-12 bg-amber-500 hover:bg-amber-600 text-black font-black px-8 rounded-2xl shadow-xl shadow-amber-500/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          LOG TRIP
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: "Today's Trips", value: stats.todayCount, icon: Car, color: 'text-amber-600', sub: 'Trips Today' },
          { label: "Today's Revenue", value: fmtMoney(stats.revenueUsd), icon: TrendingUp, color: 'text-emerald-600', sub: 'USD Collected' },
          { label: 'Top Driver', value: stats.topDriver, icon: User, color: 'text-indigo-600', sub: 'Most Active Today' },
          { label: 'Total Records', value: stats.totalTrips, icon: ArrowUpRight, color: 'text-rose-600', sub: 'All Time' },
        ].map((s) => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary">
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black tracking-tight truncate ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Trip Log Table */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight italic">Trip Log</CardTitle>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Driver Activity Stream</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drivers, routes..."
              className="pl-10 h-10 border-2 rounded-xl text-xs font-bold"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 text-[10px] font-black uppercase">Driver</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Route / Note</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Date</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase">Amount</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Method</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">By</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tripsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 italic">Syncing trip records...</TableCell>
                </TableRow>
              )}
              {!tripsQuery.isLoading && filteredTrips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No taxi trips found.</TableCell>
                </TableRow>
              )}
              {filteredTrips.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-100 rounded-full text-amber-700">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-black text-sm tracking-tight uppercase">{r.driver_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 text-amber-500" />
                      <span className="font-bold">{r.route || 'Local Trip'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] font-black text-muted-foreground">{r.trip_date}</TableCell>
                  <TableCell className="text-right">
                    {r.amount_usd > 0 && (
                      <p className="font-mono text-sm font-black text-emerald-600">{fmtMoney(r.amount_usd)}</p>
                    )}
                    {r.amount_lbp > 0 && (
                      <p className="font-mono text-[10px] font-bold text-indigo-600">{fmtMoney(r.amount_lbp, 'LBP')}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <MethodBadge method={r.payment_method} />
                  </TableCell>
                  <TableCell className="text-center">
                    <UserBadge name={r.created_by} />
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(r)}
                      className="h-8 w-8 text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trip Form Sheet */}
      <Sheet open={tripSheetOpen} onOpenChange={(open) => { setTripSheetOpen(open); if (!open) resetForm() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <div className="p-8 bg-amber-500 text-black">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">
              {editingTrip ? 'EDIT TRIP RECORD' : 'LOG NEW TRIP'}
            </h2>
            <p className="text-amber-900/70 text-sm font-medium">Capture driver, route, and fare details.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <User className="w-3 h-3" /> Driver Name *
              </Label>
              <Input
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                placeholder="e.g. Jean Doe"
                className="h-12 border-2 font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Trip Date
              </Label>
              <Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="h-12 border-2 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Route / Details
              </Label>
              <Input
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="e.g. Beirut → Tripoli"
                className="h-12 border-2 font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" /> Payment Method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash (Physical)</SelectItem>
                  <SelectItem value="Whish">Whish Money</SelectItem>
                  <SelectItem value="Card">Bank Card / POS</SelectItem>
                  <SelectItem value="Debt">Client Debt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-6 bg-amber-50 rounded-3xl border-2 border-amber-200 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[3px] text-amber-700">Fare Amount</p>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">USD Fare</Label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-amber-800/50 font-mono font-black">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={usd}
                    onChange={(e) => setUsd(e.target.value)}
                    className="h-12 pl-8 border-2 font-mono text-lg font-black border-amber-300 focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">LBP Fare</Label>
                <Input
                  type="number"
                  value={lbp}
                  onChange={(e) => setLbp(e.target.value)}
                  className="h-12 border-2 font-mono text-lg font-black border-amber-300 focus:border-amber-500"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-black font-black text-lg rounded-2xl shadow-xl shadow-amber-500/20"
            >
              {saveMutation.isPending ? 'SAVING...' : editingTrip ? 'UPDATE TRIP RECORD' : 'SAVE TRIP RECORD'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
