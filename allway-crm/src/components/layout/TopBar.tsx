import { LogOut, ChevronDown } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useCan } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface NavItem {
  key: string
  label: string
  path: string
  whish?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard',  label: 'Dashboard',       path: '/' },
  { key: 'daily-balance', label: 'Daily Balance', path: '/daily-balance' },
  { key: 'sales',      label: 'Sales',            path: '/sales' },
  { key: 'clients',    label: 'Clients',          path: '/clients' },
  { key: 'products',   label: 'Products',         path: '/products' },
  { key: 'purchasing', label: 'Purchasing',       path: '/purchasing' },
  { key: 'suppliers',  label: 'Suppliers',        path: '/suppliers' },
  { key: 'expenses',   label: 'Expenses',         path: '/expenses' },
  { key: 'whish',      label: 'Whish',            path: '/whish',    whish: true },
  { key: 'recharge',   label: 'Recharges',        path: '/recharge' },
  { key: 'internet',   label: 'Internet',         path: '/internet' },
  { key: 'taxi',       label: 'Taxi',             path: '/taxi' },
  { key: 'inventory',  label: 'Inventory Check',  path: '/inventory' },
  { key: 'returns',    label: 'Returns',          path: '/returns' },
  { key: 'shift',      label: 'Shift',            path: '/shift' },
  { key: 'audit',      label: 'Audit Log',        path: '/audit' },
  { key: 'users',      label: 'Users',            path: '/users' },
  { key: 'settings',   label: 'Settings',         path: '/settings' },
] as const

function NavItem({ item }: { item: NavItem }) {
  const can = useCan(item.key)
  const { pathname } = useLocation()
  if (!can) return null

  const active = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))

  return (
    <Link
      to={item.path}
      className={cn(
        'px-3.5 h-[52px] flex items-center text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
        item.whish
          ? active
            ? 'text-[var(--color-whish)] border-[var(--color-whish)]'
            : 'text-muted-foreground border-transparent hover:text-[var(--color-whish)]'
          : active
            ? 'text-foreground border-[var(--color-gold)]'
            : 'text-muted-foreground border-transparent hover:text-foreground/80',
      )}
    >
      {item.label}
    </Link>
  )
}

export function TopBar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 flex items-center h-[52px] bg-card border-b border-border shadow-[0_1px_0_hsl(var(--border))] px-6 gap-0">
      {/* Logo */}
      <span className="font-display text-[17px] font-semibold tracking-tight mr-6 shrink-0">
        All<span className="text-[var(--color-gold)]">Way</span>
      </span>

      {/* Nav */}
      <nav className="flex flex-1 overflow-x-auto gap-0 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(item => <NavItem key={item.key} item={item} />)}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {profile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-3 rounded-full bg-secondary border border-border">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-green-brand)] shadow-[0_0_6px_var(--color-green-brand)]" />
                <span className="font-mono text-[11px] font-medium">{profile.name}</span>
                <span className="text-muted-foreground text-[10px]">{profile.role}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <div className="px-3 py-2 text-xs text-muted-foreground font-mono">{profile.station}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
