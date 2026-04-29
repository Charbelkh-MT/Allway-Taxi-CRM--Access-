import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import { useRole } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RoleBadge } from '@/components/shared/Badges'
import type { Role } from '@/types/database'

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
  const role = useRole()
  const isAdmin = role === 'admin'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)

  const [uName, setUName] = useState('')
  const [uUsername, setUUsername] = useState('')
  const [uPass, setUPass] = useState('')
  const [uRole, setURole] = useState<Role>('cashier')
  const [uStation, setUStation] = useState(STATIONS[0])
  const [uActive, setUActive] = useState(true)
  const [provisionAuth, setProvisionAuth] = useState(true)

  const usersQuery = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  function handleOpenAdd() {
    setEditingUser(null)
    setUName(''); setUUsername(''); setUPass(''); setURole('cashier'); setUStation(STATIONS[0]); setUActive(true); setProvisionAuth(true)
    setDialogOpen(true)
  }

  function handleOpenEdit(u: any) {
    setEditingUser(u)
    setUName(u.name)
    setUUsername(u.username)
    setUPass('') // Don't show existing password
    setURole(u.role)
    setUStation(u.station)
    setUActive(u.active)
    setProvisionAuth(false) // Default to false for edits
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!uName.trim() || !uUsername.trim()) throw new Error('Name and Username are required')
      if (!editingUser && !uPass.trim()) throw new Error('Password is required for new users')
      
      const normalizedUsername = uUsername.trim().toLowerCase()
      const payload = {
        name: uName.trim(), username: normalizedUsername,
        role: uRole, station: uStation, active: uActive,
      }

      if (editingUser) {
        // Update profile
        const { error } = await (supabase as any).from('users').update(payload).eq('id', editingUser.id)
        if (error) throw error
        await log('user_edited', 'Users', `Updated user: ${uName.trim()} (${normalizedUsername})`)
        return { authProvisioned: false as const }
      }

      if (provisionAuth) {
        const { error: provisionError } = await (supabase as any).rpc('provision_auth_user', {
          p_username: normalizedUsername,
          p_password: uPass,
          p_name: uName.trim(),
          p_role: uRole,
          p_station: uStation,
        })
        if (!provisionError) {
          await log('user_added', 'Users', `New user provisioned: ${uName.trim()} (${normalizedUsername}) — ${uRole}`)
          return { authProvisioned: true as const }
        }
      }

      const { error } = await (supabase as any).from('users').insert({
        ...payload, password_hash: uPass,
      })
      if (error) throw error
      await log('user_added', 'Users', `New user profile: ${uName.trim()} (${normalizedUsername}) — ${uRole}`)
      return { authProvisioned: false as const }
    },
    onSuccess: ({ authProvisioned }) => {
      if (authProvisioned) {
        toast.success('User saved with Auth account')
      } else {
        toast.success(editingUser ? 'User updated' : 'User profile saved')
      }
      void queryClient.invalidateQueries({ queryKey: QK })
      setDialogOpen(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save user'),
  })

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Access restricted — admins only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">{(usersQuery.data ?? []).length} users</p>
        </div>
        <Button onClick={handleOpenAdd}>+ Add user</Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead>Station</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {usersQuery.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>}
            {(usersQuery.data ?? []).map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{u.username}</TableCell>
                <TableCell><RoleBadge role={u.role} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.station}</TableCell>
                <TableCell>{u.active ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Active</span> : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Inactive</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(u)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Security rules — always enforced</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SECURITY_RULES.map((rule, i) => (
              <div key={i} className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">⚡ {rule}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit user' : 'Add user'}</DialogTitle>
            <DialogDescription>{editingUser ? 'Update account details.' : 'Create a new CRM user account.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full name</Label><Input value={uName} onChange={e => setUName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Username</Label><Input value={uUsername} onChange={e => setUUsername(e.target.value)} disabled={!!editingUser} /></div>
            </div>
            {!editingUser && <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={uPass} onChange={e => setUPass(e.target.value)} /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={uRole} onValueChange={v => setURole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Station</Label>
                <Select value={uStation} onValueChange={setUStation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            {editingUser && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">User active status</p>
                <Button type="button" variant={uActive ? 'default' : 'destructive'} size="sm" onClick={() => setUActive(v => !v)}>
                  {uActive ? 'Active' : 'Inactive'}
                </Button>
              </div>
            )}

            {!editingUser && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">Provision Supabase Auth login now</p>
                <Button type="button" variant={provisionAuth ? 'default' : 'outline'} size="sm" onClick={() => setProvisionAuth(v => !v)}>
                  {provisionAuth ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : editingUser ? 'Update user' : 'Save user'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
