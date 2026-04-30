import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useProductsCache } from '@/hooks/useProductsCache'
import { BarcodeCamera } from '@/components/shared/BarcodeCamera'
import { useBarcode } from '@/hooks/useBarcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { UserBadge } from '@/components/shared/Badges'
import { ClipboardCheck, Plus, History, TrendingUp, AlertTriangle, CheckCircle2, Box, Search, ShieldAlert } from 'lucide-react'

const QK = ['inventory_checks']

export default function Inventory() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { log } = useAuditLog()
  const role = useRole()
  const isSup = role === 'admin' || role === 'supervisor'
  const { data: products = [] } = useProductsCache()

  const [activeTab, setActiveTab] = useState('history')
  const [productName, setProductName] = useState('')
  const [systemQty, setSystemQty] = useState(0)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')

  const diff = counted !== '' ? parseInt(counted) - systemQty : null

  useEffect(() => {
    const match = products.find(p => p.description === productName)
    setSystemQty(match?.quantity ?? 0)
  }, [productName, products])

  const checksQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('inventory_checks').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = checksQuery.data ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    const todayChecks = data.filter(c => c.created_at.startsWith(todayStr))
    const mismatches = todayChecks.filter(c => c.difference !== 0).length
    
    return {
      todayCount: todayChecks.length,
      mismatchCount: mismatches
    }
  }, [checksQuery.data])

  const filteredChecks = useMemo(() => {
    const data = checksQuery.data ?? []
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(c => 
      c.product_name.toLowerCase().includes(s) || 
      c.checked_by.toLowerCase().includes(s)
    )
  }, [checksQuery.data, search])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isSup) throw new Error('Only supervisors can submit inventory checks')
      if (!productName.trim()) throw new Error('Please select a product to check')
      
      const match = products.find(p => p.description === productName)
      const cntd = parseInt(counted) || 0
      const d = cntd - systemQty
      
      const { error } = await (supabase as any).from('inventory_checks').insert({
        product_id: match?.id ?? null, 
        product_name: productName.trim(),
        system_qty: systemQty, 
        counted_qty: cntd, 
        difference: d,
        checked_by: profile?.name ?? 'system', 
        station: profile?.station ?? '', 
        note: note.trim(),
      })
      
      if (error) throw error
      const msg = d !== 0 ? `Mismatch — ${productName}: system ${systemQty} counted ${cntd} diff ${d}` : `Check OK — ${productName} qty ${systemQty}`
      await log(d !== 0 ? 'inventory_mismatch' : 'inventory_ok', 'Inventory', msg)
      return d
    },
    onSuccess: (d) => {
      if (d !== null && d < 0) toast.warning(`Shortage detected! Difference: ${d}`, { duration: 5000 })
      else if (d !== null && d > 0) toast.warning(`Surplus detected. Difference: +${d}`, { duration: 5000 })
      else toast.success('✓ Inventory matches system records')
      
      void queryClient.invalidateQueries({ queryKey: QK })
      setProductName(''); setSystemQty(0); setCounted(''); setNote('')
      setActiveTab('history')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Submission failed'),
  })

  // Barcode scanner — scan product to instantly fill the spot-check form
  const handleBarcodeScan = (barcode: string) => {
    const match = products.find(p => p.barcode === barcode)
    if (match) {
      setProductName(match.description)
      toast.success(`Found: ${match.description} — system qty: ${match.quantity}`, { duration: 3000 })
    } else {
      toast.error(`Barcode "${barcode}" not found in products`)
    }
  }

  useBarcode({ onScan: handleBarcodeScan })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Inventory Check</h1>
          <p className="text-muted-foreground text-sm mt-1">Random spot checks to ensure physical stock matches digital records.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-primary/5 border-primary/20">
            <div className="mr-3 p-2 bg-primary/10 rounded-full text-primary">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Checks Today</p>
              <p className="text-lg font-bold font-mono leading-none text-primary">{stats.todayCount}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-destructive/5 border-destructive/20">
            <div className="mr-3 p-2 bg-destructive/10 rounded-full text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Mismatches</p>
              <p className="text-lg font-bold font-mono leading-none text-destructive">{stats.mismatchCount}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 font-medium leading-none">
          Discrepancies are logged permanently and sent to the audit dashboard.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid grid-cols-2 w-[350px]">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Spot Check
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'history' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search products, users..." 
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
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">System Qty</TableHead>
                  <TableHead className="text-center">Physical Count</TableHead>
                  <TableHead className="text-center">Difference</TableHead>
                  <TableHead className="text-center">Checked By</TableHead>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checksQuery.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">Loading audit records...</TableCell></TableRow>}
                {!checksQuery.isLoading && filteredChecks.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">No inventory checks found.</TableCell></TableRow>}
                {filteredChecks.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-secondary/5 transition-colors group">
                    <TableCell className="max-w-[240px]">
                      <p className="font-bold text-sm tracking-tight truncate">{r.product_name}</p>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {r.system_qty}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm font-bold">
                      {r.counted_qty}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.difference === 0 ? (
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase">Matches</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className={`font-mono font-bold ${r.difference < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {r.difference > 0 ? '+' : ''}{r.difference} {r.difference < 0 ? '⚠ Shortage' : '⚠ Surplus'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <UserBadge name={r.checked_by} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs italic text-muted-foreground max-w-[150px] truncate">
                      {r.note || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <Card className="border-2 border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-xl flex items-center gap-2 text-primary">
                <Box className="w-5 h-5" />
                Physical Stock Count
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2 lg:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Search Product</Label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        list="inv-products" 
                        value={productName} 
                        onChange={e => setProductName(e.target.value)} 
                        placeholder="Type product name or scan barcode..." 
                        className="h-11 pl-10 font-medium" 
                      />
                      <datalist id="inv-products">
                        {products.map(p => <option key={p.id} value={p.description} />)}
                      </datalist>
                    </div>
                    <BarcodeCamera onScan={handleBarcodeScan} label="Scan" className="h-11" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">System Record</Label>
                  <div className="h-11 flex items-center px-4 bg-secondary/30 border rounded-md font-mono text-lg font-bold text-muted-foreground">
                    {systemQty}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-primary">Physical Count</Label>
                  <Input 
                    type="number" 
                    value={counted} 
                    onChange={e => setCounted(e.target.value)} 
                    placeholder="Enter qty..." 
                    className="h-11 font-mono text-xl font-bold border-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              {productName && counted !== '' && (
                <div className={`p-6 rounded-xl border-2 flex items-center justify-between transition-all ${
                  diff === 0 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : diff !== null && diff < 0 
                      ? 'bg-red-50 border-red-200 text-red-800' 
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${
                      diff === 0 ? 'bg-green-100' : diff !== null && diff < 0 ? 'bg-red-100' : 'bg-amber-100'
                    }`}>
                      {diff === 0 ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-tight">
                        {diff === 0 ? 'Inventory Matches' : diff !== null && diff < 0 ? 'Stock Shortage Found' : 'Stock Surplus Found'}
                      </p>
                      <p className="text-sm opacity-80">
                        {diff === 0 ? 'System and physical counts are equal.' : `There is a difference of ${diff} units.`}
                      </p>
                    </div>
                  </div>
                  <div className="text-4xl font-mono font-bold">
                    {diff !== null && diff > 0 ? '+' : ''}{diff}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Discrepancy Note / Explanation</Label>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Why is there a difference? (Optional)" className="h-11" />
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  Submission is restricted to <span className="font-bold text-foreground">Supervisors & Admins</span>
                </div>
                {isSup ? (
                  <Button 
                    onClick={() => saveMutation.mutate()} 
                    disabled={saveMutation.isPending || !productName || counted === ''} 
                    className="w-full sm:w-64 h-12 bg-primary hover:bg-primary/90 text-lg font-bold shadow-lg shadow-primary/20"
                  >
                    {saveMutation.isPending ? 'Submitting...' : 'Confirm Audit Count'}
                  </Button>
                ) : (
                  <Button disabled className="w-full sm:w-64 h-12 opacity-50 cursor-not-allowed">
                    Supervisor Only
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
