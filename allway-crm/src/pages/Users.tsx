import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { SkeletonRows } from '@/components/shared/SkeletonRows'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useRole, useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/shared/Badges'
import type { Role } from '@/types/database'
import { Spinner } from '@/components/shared/Spinner'
import {
  Users as UsersIcon,
  Shield,
  UserCheck,
  UserX,
  PlusCircle,
  Pencil,
  ArrowUpRight,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react'

const QK = ['users']
const ROLES: Role[] = ['cashier', 'senior', 'supervisor', 'admin']
const STATIONS = ['Main Station', 'Station 01', 'Station 02', 'Station 03', 'Laptop']
const SECURITY_RULES = [
  'No invoice can be deleted — only voided with reason',
  'Void requires supervisor approval + reason logged',
  'Every action stamped with user + station + timestamp',
  'Cash mismatch auto-flagged on shift close',
  'Expenses need supervisor approval before payment',
  'Purchasing restricted to supervisor / admin only',
]

export default function Users() {
  const queryClient = useQueryClient()
  const { log } = useAuditLog()
  const { profile } = useAuth()
  const role = useRole()
  const isAdmin = role === 'admin'

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [uName, setUName] = useState('')
  const [uUsername, setUUsername] = useState('')
  const [uPass, setUPass] = useState('')
  const [uRole, setURole] = useState<Role>('cashier')
  const [uStation, setUStation] = useState(STATIONS[0])
  const [uActive, setUActive] = useState(true)

  const usersQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const users = (usersQuery.data ?? []) as any[]

  const stats = {
    total: users.length,
    active: users.filter(u => u.active).length,
    admins: users.filter(u => u.role === 'admin' || u.role === 'supervisor').length,
    inactive: users.filter(u => !u.active).length,
  }

  function openAdd() {
    setEditingUser(null)
    setUName(''); setUUsername(''); setUPass(''); setURole('cashier'); setUStation(STATIONS[0]); setUActive(true)
    setSheetOpen(true)
  }

  function openEdit(u: any) {
    setEditingUser(u)
    setUName(u.name); setUUsername(u.username); setUPass('')
    setURole(u.role); setUStation(u.station); setUActive(u.active)
    setSheetOpen(true)
  }

  function resetForm() {
    setEditingUser(null)
    setUName(''); setUUsername(''); setUPass(''); setURole('cashier'); setUStation(STATIONS[0]); setUActive(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!uName.trim() || !uUsername.trim()) throw new Error('Name and username are required')
      if (!editingUser && !uPass.trim()) throw new Error('Password is required for new users')
      const normalizedUsername = uUsername.trim().toLowerCase()
      const payload = { name: uName.trim(), username: normalizedUsername, role: uRole, station: uStation, active: uActive }
      if (editingUser) {
        const { error } = await (supabase as any).from('users').update(payload).eq('id', editingUser.id)
        if (error) throw error
        if (editingUser.active && !uActive)
          await log('user_deactivated', 'Users', `SECURITY: Account DEACTIVATED — ${uName.trim()} by ${profile?.name}`)
        if (!editingUser.active && uActive)
          await log('user_reactivated', 'Users', `Account reactivated — ${uName.trim()} by ${profile?.name}`)
        await log('user_edited', 'Users', `Updated: ${uName.trim()}`)
      } else {
        const { error } = await (supabase as any).from('users').insert(payload)
        if (error) throw error
        await log('user_added', 'Users', `New user: ${uName.trim()} (${normalizedUsername}) — ${uRole}`)
      }
    },
    onSuccess: () => {
      toast.success(editingUser ? 'User updated' : 'User created')
      void queryClient.invalidateQueries({ queryKey: QK })
      setSheetOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save user'),
  })

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto space-y-10 pb-20">
        <div className="flex flex-col border-b pb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">User Management</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">User Accounts</h1>
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

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-600 shadow-[0_0_8px_theme(colors.slate.400)]" />
            <span className="text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">User Management</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tighter text-foreground italic uppercase">User Accounts</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Manage CRM access, roles, and station assignments.</p>
        </div>
        <Button
          onClick={openAdd}
          className="h-12 bg-slate-800 hover:bg-slate-900 text-white font-black px-8 rounded-2xl shadow-xl shadow-slate-800/20 group"
        >
          <PlusCircle className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          ADD USER
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stat-grid">
        {[
          { label: 'Total Users', value: stats.total, icon: UsersIcon, color: 'text-slate-700', sub: 'All accounts' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-emerald-600', sub: 'With access' },
          { label: 'Admins / Supervisors', value: stats.admins, icon: Shield, color: 'text-indigo-600', sub: 'Elevated privileges' },
          { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'text-rose-600', sub: 'Suspended accounts' },
        ].map(s => (
          <div key={s.label} className="p-6 bg-background border-2 rounded-3xl">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-secondary"><s.icon className="w-4 h-4 text-muted-foreground" /></div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[9px] font-bold text-muted-foreground mt-1 opacity-50">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <CardHeader className="bg-secondary/30 pb-6 border-b">
          <CardTitle className="text-lg font-black uppercase tracking-tight italic">Account Registry</CardTitle>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''} · Admin access only</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="aw-table">
            <TableHeader className="bg-secondary/20">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="pl-6 text-[10px] font-black uppercase">Employee</TableHead>
                <TableHead className="text-[10px] font-black uppercase">Username</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Role</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Station</TableHead>
                <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading && (
                <SkeletonRows cols={6} />
              )}
              {!usersQuery.isLoading && users.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground">No users found.</TableCell></TableRow>
              )}
              {users.map((u: any) => (
                <TableRow key={u.id} className="hover:bg-secondary/10 transition-colors group">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black border-2 ${u.active ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-red-50 text-red-400 border-red-200'}`}>
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-sm uppercase tracking-tight leading-none mb-0.5">{u.name}</p>
                        <p className="text-[9px] font-bold text-muted-foreground opacity-60">{u.station}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs font-black text-muted-foreground">@{u.username}</TableCell>
                  <TableCell className="text-center"><RoleBadge role={u.role} /></TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono text-[9px] font-black uppercase bg-secondary/50">
                      {u.station?.split(' ')[0] || 'Main'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {u.active ? (
                      <div className="flex items-center justify-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-black uppercase">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-destructive">
                        <UserX className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-black uppercase">Inactive</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(u)}
                      className="h-8 w-8 text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Security Rules */}
      <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
        <div className="p-6 bg-slate-800 text-white flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-2xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight italic">Security Rules — Always Enforced</h2>
            <p className="text-slate-300 text-sm font-medium">These controls are hardcoded and cannot be bypassed.</p>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SECURITY_RULES.map((rule, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/30 border-2">
                <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-foreground">{rule}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) resetForm() }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <div className="p-8 bg-slate-800 text-white">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic">
              {editingUser ? 'EDIT USER ACCOUNT' : 'NEW USER ACCOUNT'}
            </h2>
            <p className="text-slate-300 text-sm font-medium">
              {editingUser ? 'Update role, station, or access status.' : 'Create a new CRM login for a staff member.'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name *</Label>
              <Input value={uName} onChange={e => setUName(e.target.value)} placeholder="Employee full name" className="h-12 border-2 font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Username *</Label>
              <Input
                value={uUsername}
                onChange={e => setUUsername(e.target.value)}
                placeholder="login username"
                disabled={!!editingUser}
                className="h-12 border-2 font-mono font-bold disabled:opacity-50"
              />
              {editingUser && <p className="text-[10px] text-muted-foreground font-medium ml-1">Username cannot be changed after creation.</p>}
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Password *</Label>
                <Input type="password" value={uPass} onChange={e => setUPass(e.target.value)} placeholder="Temporary password" className="h-12 border-2 font-bold" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Role</Label>
                <Select value={uRole} onValueChange={v => setURole(v as Role)}>
                  <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r} className="font-bold">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Station</Label>
                <Select value={uStation} onValueChange={setUStation}>
                  <SelectTrigger className="h-12 border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editingUser && (
              <div className={`p-4 rounded-2xl border-2 flex items-center justify-between ${uActive ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${uActive ? 'text-emerald-700' : 'text-red-700'}`}>Account Status</p>
                  <p className={`text-sm font-black ${uActive ? 'text-emerald-900' : 'text-red-900'}`}>{uActive ? 'Active — can log in' : 'Inactive — access blocked'}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => setUActive(v => !v)}
                  className={`h-10 font-black rounded-xl ${uActive ? 'bg-red-100 text-red-700 hover:bg-red-200 border-2 border-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-2 border-emerald-200'}`}
                  variant="ghost"
                >
                  {uActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            )}

            <div className="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 flex gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                All account changes are logged in the Audit Log with the admin's name and timestamp.
              </p>
            </div>
          </div>
          <SheetFooter className="p-8 bg-secondary/10 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-14 bg-slate-800 hover:bg-slate-900 text-white font-black text-lg rounded-2xl shadow-xl shadow-slate-800/20"
            >
              {saveMutation.isPending ? 'SAVING...' : editingUser ? 'UPDATE ACCOUNT' : 'CREATE ACCOUNT'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
