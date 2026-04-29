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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { MethodBadge, UserBadge } from '@/components/shared/Badges'
import { Car, Plus, History, TrendingUp, MapPin, Calendar, CreditCard, Search, User } from 'lucide-react'

const QK = ['taxi_trips']

export default function Taxi() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()

  const [activeTab, setActiveTab] = useState('history')
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
    const todayTrips = data.filter(t => t.trip_date === day)
    
    const revenueUsd = todayTrips.reduce((sum, t) => sum + (parseFloat(t.amount_usd) || 0), 0)
    const revenueLbp = todayTrips.reduce((sum, t) => sum + (parseFloat(t.amount_lbp) || 0), 0)
    
    // Find top driver today
    const driverCounts: Record<string, number> = {}
    todayTrips.forEach(t => {
      driverCounts[t.driver_name] = (driverCounts[t.driver_name] || 0) + 1
    })
    const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None'

    return {
      todayCount: todayTrips.length,
      revenueUsd,
      revenueLbp,
      topDriver
    }
  }, [tripsQuery.data])

  const filteredTrips = useMemo(() => {
    const data = (tripsQuery.data ?? []) as any[]
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(t => 
      t.driver_name.toLowerCase().includes(s) || 
      (t.route?.toLowerCase().includes(s))
    )
  }, [tripsQuery.data, search])

  function handleEdit(r: any) {
    setEditingTrip(r)
    setDriver(r.driver_name)
    setTripDate(r.trip_date)
    setUsd(String(normalizeMoney(r.amount_usd, 'USD')))
    setLbp(String(normalizeMoney(r.amount_lbp, 'LBP')))
    setMethod(r.payment_method)
    setRoute(r.route || '')
    setActiveTab('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditingTrip(null)
    setDriver(''); setUsd('0'); setLbp('0'); setRoute(''); setTripDate(today()); setMethod('Cash')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!driver.trim()) throw new Error('Driver name is required')
      if (parseFloat(usd) <= 0 && parseInt(lbp) <= 0) throw new Error('Please enter a trip amount')
      
      const payload = {
        driver_name: driver.trim(), trip_date: tripDate, amount_usd: parseFloat(usd) || 0,
        amount_lbp: parseInt(lbp) || 0, payment_method: method, route: route.trim(),
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
      setActiveTab('history')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save trip'),
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Taxi Dispatch</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage driver trips, routes, and revenue collection.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-yellow-500/5 border-yellow-500/20">
            <div className="mr-3 p-2 bg-yellow-500/10 rounded-full text-yellow-600">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Today's Trips</p>
              <p className="text-lg font-bold font-mono leading-none text-yellow-600">{stats.todayCount}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-green-500/5 border-green-500/20">
            <div className="mr-3 p-2 bg-green-500/10 rounded-full text-green-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Today's Revenue</p>
              <p className="text-lg font-bold font-mono leading-none text-green-600">{fmtMoney(stats.revenueUsd)}</p>
            </div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid grid-cols-2 w-[350px]">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Trip Log
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {editingTrip ? 'Edit Trip' : 'New Trip'}
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'history' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search drivers, routes..." 
                className="pl-9 h-10 shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <TabsContent value="history" className="mt-0 space-y-4">
          <div className="rounded-xl border-2 shadow-sm overflow-hidden bg-background">
            <Table>
              <TableHeader className="bg-secondary/40">
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Route / Note</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Method</TableHead>
                  <TableHead className="text-center">By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tripsQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">Loading trips...</TableCell></TableRow>}
                {!tripsQuery.isLoading && filteredTrips.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No taxi trips found.</TableCell></TableRow>}
                {filteredTrips.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-yellow-100 rounded-full text-yellow-700">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-sm tracking-tight">{r.driver_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 text-primary" />
                        {r.route || 'Local Trip'}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground italic">
                      {r.trip_date}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.amount_usd > 0 && <p className="font-mono text-xs font-bold text-green-600">{fmtMoney(r.amount_usd)}</p>}
                      {r.amount_lbp > 0 && <p className="font-mono text-[10px] text-blue-600">{fmtMoney(r.amount_lbp, 'LBP')}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <MethodBadge method={r.payment_method} />
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={r.created_by} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 px-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleEdit(r)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <Card className="border-2 border-yellow-500/20 shadow-md">
            <CardHeader className="bg-yellow-500/5 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Car className="w-5 h-5 text-yellow-600" />
                  {editingTrip ? 'Edit Taxi Trip Record' : 'Log New Taxi Trip'}
                </CardTitle>
                {editingTrip && (
                  <Button variant="ghost" size="sm" onClick={resetForm} className="text-destructive hover:bg-destructive/10">
                    Cancel Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Driver Name *
                    </Label>
                    <Input 
                      value={driver} 
                      onChange={e => setDriver(e.target.value)} 
                      placeholder="e.g. Jean Doe" 
                      className="h-11 font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Trip Date
                    </Label>
                    <Input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="h-11" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Route / Route Details
                    </Label>
                    <Input value={route} onChange={e => setRoute(e.target.value)} placeholder="e.g. Beirut → Tripoli" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" /> Payment Method
                    </Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash (Physical)</SelectItem>
                        <SelectItem value="Whish">Whish Money</SelectItem>
                        <SelectItem value="Card">Bank Card / POS</SelectItem>
                        <SelectItem value="Debt">Client Debt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-6 p-6 bg-yellow-500/5 rounded-xl border border-yellow-500/20">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-yellow-800">Fare USD</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-yellow-800/50 font-mono font-bold">$</span>
                      <Input type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} className="h-11 pl-8 font-mono text-lg font-bold border-yellow-500/30 focus:border-yellow-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-yellow-800">Fare LBP</Label>
                    <Input type="number" value={lbp} onChange={e => setLbp(e.target.value)} className="h-11 font-mono text-lg font-bold border-yellow-500/30 focus:border-yellow-500" />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted-foreground font-medium italic">
                  ⚡ All taxi revenue is audited against the daily shift balance.
                </div>
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending} 
                  className="w-full sm:w-64 h-12 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg shadow-lg shadow-yellow-500/20"
                >
                  {saveMutation.isPending ? 'Saving...' : editingTrip ? 'Update Trip' : 'Save Trip Record'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
