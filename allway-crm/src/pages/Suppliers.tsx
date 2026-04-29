import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/utils'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  User, 
  Wallet, 
  ExternalLink, 
  MoreVertical,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Truck
} from 'lucide-react'
import type { Supplier } from '@/types/database'

const QK = ['suppliers']

export default function Suppliers() {
  const queryClient = useQueryClient()
  const { log } = useAuditLog()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('0')

  const suppliersQuery = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    const data = suppliersQuery.data ?? []
    const totalBalance = data.reduce((sum, s) => sum + (s.usd_balance || 0), 0)
    return {
      count: data.length,
      totalBalance
    }
  }, [suppliersQuery.data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return suppliersQuery.data ?? []
    return (suppliersQuery.data ?? []).filter(s => 
      s.name.toLowerCase().includes(term) || 
      (s.contact_person || '').toLowerCase().includes(term) ||
      (s.mobile || '').toLowerCase().includes(term)
    )
  }, [suppliersQuery.data, search])

  function handleOpenAdd() {
    setEditingSupplier(null)
    setName(''); setContact(''); setMobile(''); setAddress(''); setBalance('0')
    setDialogOpen(true)
  }

  function handleOpenEdit(s: Supplier) {
    setEditingSupplier(s)
    setName(s.name)
    setContact(s.contact_person || '')
    setMobile(s.mobile || '')
    setAddress(s.address || '')
    setBalance((s.usd_balance || 0).toString())
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Supplier name is required')
      const payload = { 
        name: name.trim(), 
        contact_person: contact.trim(), 
        mobile: mobile.trim(),
        address: address.trim(),
        usd_balance: parseFloat(balance) || 0
      }

      if (editingSupplier) {
        const { error } = await (supabase as any).from('suppliers').update(payload).eq('id', editingSupplier.id)
        if (error) throw error
        await log('supplier_edited', 'Suppliers', `Updated supplier: ${name.trim()}`)
      } else {
        const { error } = await (supabase as any).from('suppliers').insert(payload)
        if (error) throw error
        await log('supplier_added', 'Suppliers', `New supplier: ${name.trim()}`)
      }
    },
    onSuccess: () => {
      toast.success(editingSupplier ? 'Supplier information updated' : 'New supplier added to catalog')
      void queryClient.invalidateQueries({ queryKey: QK })
      setDialogOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save supplier'),
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Supplier Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage vendor partnerships, contact details, and outstanding balances.</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="flex items-center px-4 py-2 bg-primary/5 border-primary/20">
            <div className="mr-3 p-2 bg-primary/10 rounded-full text-primary">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Active Vendors</p>
              <p className="text-lg font-bold font-mono leading-none text-primary">{stats.count}</p>
            </div>
          </Card>
          <Card className="flex items-center px-4 py-2 bg-destructive/5 border-destructive/20">
            <div className="mr-3 p-2 bg-destructive/10 rounded-full text-destructive">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Total Payable</p>
              <p className="text-lg font-bold font-mono leading-none text-destructive">{fmtMoney(stats.totalBalance)}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search name, contact, phone..." 
            className="pl-10 h-10 shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={handleOpenAdd} className="h-10 px-6 gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" />
          Add New Supplier
        </Button>
      </div>

      <div className="rounded-xl border-2 shadow-sm overflow-hidden bg-background">
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow>
              <TableHead className="w-[280px]">Company Name</TableHead>
              <TableHead>Primary Contact</TableHead>
              <TableHead>Contact Methods</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Balance (USD)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliersQuery.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">Syncing directory...</TableCell></TableRow>}
            {!suppliersQuery.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground">No suppliers found matching your search.</TableCell></TableRow>}
            {filtered.map(s => (
              <TableRow key={s.id} className="hover:bg-secondary/5 transition-colors group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary/50 rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm tracking-tight">{s.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    {s.contact_person || 'No primary contact'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {s.mobile ? (
                      <Badge variant="secondary" className="flex items-center gap-1.5 h-6 font-mono text-[10px] bg-secondary/50">
                        <Phone className="w-3 h-3" />
                        {s.mobile}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No phone</span>
                    )}
                    {s.mobile && (
                      <a 
                        href={`https://wa.me/${s.mobile.replace(/[^0-9]/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[180px] truncate" title={s.address || ''}>
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    {s.address || 'No address provided'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`font-mono font-bold text-sm ${s.usd_balance && s.usd_balance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {fmtMoney(s.usd_balance || 0)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 px-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleOpenEdit(s)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {editingSupplier ? 'Update Supplier Details' : 'Register New Supplier'}
            </DialogTitle>
            <DialogDescription>Maintain accurate records for your vendors and outstanding balances.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Company Name *</Label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. Alpha Distribution" 
                className="h-11 font-medium" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Person</Label>
                <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Full Name" className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mobile / WhatsApp</Label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+961..." className="h-11 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Office Address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Building, Street, City..." className="h-11" />
            </div>
            <div className="space-y-2 p-4 bg-secondary/20 rounded-xl border border-secondary">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Wallet className="w-3 h-3" /> Initial Balance (USD)
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-mono font-bold">$</span>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={balance} 
                  onChange={e => setBalance(e.target.value)} 
                  className="h-11 pl-8 font-mono text-lg font-bold" 
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-11">Cancel</Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending} 
              className="h-11 px-8 bg-primary hover:bg-primary/90 font-bold shadow-lg shadow-primary/20"
            >
              {saveMutation.isPending ? 'Saving...' : editingSupplier ? 'Update Record' : 'Create Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
