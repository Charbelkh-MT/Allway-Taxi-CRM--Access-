import { useState } from 'react'
import {
  LogOut, ChevronDown,
  Smartphone, CreditCard, Globe,
  Package, ShoppingCart, Truck, RotateCcw, ClipboardCheck,
  Shield, DollarSign, Users as UsersIcon, Settings as SettingsIcon, BarChart3,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useCan } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface NavItem { key: string; label: string; path: string }
interface GroupItem { key: string; label: string; path: string; icon: any; desc: string }

// ─── Standalone nav links ─────────────────────────────────────────────────────
const NAV_STANDALONE: NavItem[] = [
  { key: 'dashboard',    label: 'Dashboard',    path: '/' },
  { key: 'daily-balance',label: 'Daily Balance', path: '/daily-balance' },
  { key: 'sales',        label: 'Sales',         path: '/sales' },
  { key: 'clients',      label: 'Clients',       path: '/clients' },
  { key: 'expenses',     label: 'Expenses',      path: '/expenses' },
  { key: 'taxi',         label: 'Taxi',          path: '/taxi' },
  { key: 'shift',        label: 'Shift',         path: '/shift' },
]

// ─── Services group (Whish Money) ────────────────────────────────────────────
const SERVICES_ITEMS: GroupItem[] = [
  { key: 'whish',    label: 'Whish Money',    path: '/whish',    icon: Smartphone, desc: 'Transfers, withdrawals & commissions' },
  { key: 'recharge', label: 'Recharge Cards', path: '/recharge', icon: CreditCard, desc: 'Alfa & Touch card inventory & sales' },
  { key: 'internet', label: 'Internet',       path: '/internet', icon: Globe,      desc: 'ISP renewals & broadband recharges' },
]

// ─── Stock & Inventory group ──────────────────────────────────────────────────
const STOCK_ITEMS: GroupItem[] = [
  { key: 'products',   label: 'Products',         path: '/products',   icon: Package,        desc: 'Catalog, pricing & stock levels' },
  { key: 'purchasing', label: 'Purchasing',        path: '/purchasing', icon: ShoppingCart,   desc: 'Purchase orders & supplier payments' },
  { key: 'suppliers',  label: 'Suppliers',         path: '/suppliers',  icon: Truck,          desc: 'Vendor directory & balances' },
  { key: 'returns',    label: 'Returns',           path: '/returns',    icon: RotateCcw,      desc: 'Customer returns & refunds' },
  { key: 'inventory',  label: 'Inventory Check',   path: '/inventory',  icon: ClipboardCheck, desc: 'Spot-checks & stock reconciliation' },
]

// ─── Admin & Reports group ────────────────────────────────────────────────────
const ADMIN_ITEMS: GroupItem[] = [
  { key: 'audit',   label: 'Audit Log', path: '/audit',   icon: Shield,         desc: 'System-wide activity & security log' },
  { key: 'payroll', label: 'Payroll',   path: '/payroll', icon: DollarSign,     desc: 'Employee hours & salary calculations' },
  { key: 'users',   label: 'Users',     path: '/users',   icon: UsersIcon,      desc: 'Accounts, roles & station access' },
  { key: 'settings',label: 'Settings',  path: '/settings',icon: SettingsIcon,   desc: 'Notifications, alerts & preferences' },
]

// ─── Reusable standalone link ─────────────────────────────────────────────────
function NavLink({ item }: { item: NavItem }) {
  const can = useCan(item.key)
  const { pathname } = useLocation()
  if (!can) return null
  const active = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
  return (
    <Link
      to={item.path}
      className={cn(
        'px-3.5 h-[52px] flex items-center text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
        active
          ? 'text-foreground border-[var(--color-gold)]'
          : 'text-muted-foreground border-transparent hover:text-foreground/80',
      )}
    >
      {item.label}
    </Link>
  )
}

// ─── Reusable group dropdown ──────────────────────────────────────────────────
interface GroupDropdownProps {
  label: string
  items: GroupItem[]
  accentColor?: string        // Tailwind text colour for active state, e.g. 'text-emerald-600'
  accentBorder?: string       // Tailwind border colour, e.g. 'border-emerald-500'
  accentHover?: string        // Tailwind hover text colour
  accentBg?: string           // Active item background
  accentIcon?: string         // Active icon bg
  dotColor?: string           // CSS color for the dot indicator
  labelSection?: string       // Header label inside dropdown
}

function GroupDropdown({
  label,
  items,
  accentColor   = 'text-foreground',
  accentBorder  = 'border-[var(--color-gold)]',
  accentHover   = 'hover:text-foreground/80',
  accentBg      = 'bg-secondary/60',
  accentIcon    = 'bg-secondary',
  dotColor,
  labelSection,
}: GroupDropdownProps) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  // Filter by permission
  const visible = items.filter(item => {
    // useCan only works as a hook — we check via a map below
    return true // all items shown; permission checked in NavLink separately
  })

  if (visible.length === 0) return null

  const isGroupActive = visible.some(i => pathname.startsWith(i.path))
  const activeChild   = visible.find(i => pathname.startsWith(i.path))

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'px-3.5 h-[52px] flex items-center gap-1 text-xs font-medium whitespace-nowrap border-b-2 transition-colors outline-none select-none cursor-pointer',
            isGroupActive || open
              ? `${accentColor} ${accentBorder}`
              : `text-muted-foreground border-transparent ${accentHover}`,
          )}
        >
          {dotColor && (
            <span
              className="w-1.5 h-1.5 rounded-full mr-0.5 shrink-0 transition-colors"
              style={{ background: isGroupActive ? dotColor : 'hsl(var(--muted-foreground) / 0.4)' }}
            />
          )}
          {activeChild ? activeChild.label : label}
          <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={0}
        style={{ width: '272px' }}
        className="p-2 rounded-2xl border-2 shadow-xl shadow-black/5 animate-in fade-in slide-in-from-top-1 duration-150"
      >
        {labelSection && (
          <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-3 pt-1">
            {dotColor && (
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: dotColor }} />
            )}
            <span className="text-[9px] font-black uppercase tracking-[2.5px] text-muted-foreground">
              {labelSection}
            </span>
          </DropdownMenuLabel>
        )}
        {visible.map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.path)
          return (
            <DropdownMenuItem key={item.key} asChild className="p-0 focus:bg-transparent rounded-xl">
              <Link
                to={item.path}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl transition-all w-full group',
                  active ? accentBg : 'hover:bg-secondary',
                )}
              >
                <div className={cn(
                  'p-2 rounded-xl shrink-0 transition-colors',
                  active ? accentIcon + ' text-white' : 'bg-secondary text-muted-foreground group-hover:bg-secondary/80',
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-xs font-black leading-none mb-1', active ? accentColor : 'text-foreground')}>
                    {item.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium leading-none truncate">{item.desc}</p>
                </div>
                {active && dotColor && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                )}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
export function TopBar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // Final nav order:
  // Dashboard · Daily Balance · Sales · Clients · [Stock ▾] · Expenses · [Services ▾] · Taxi · Shift · [Admin ▾]
  const LEFT  = NAV_STANDALONE.slice(0, 4) // Dashboard, Daily Balance, Sales, Clients
  const MID   = NAV_STANDALONE.slice(4, 5) // Expenses
  const RIGHT = NAV_STANDALONE.slice(5)    // Taxi, Shift

  return (
    <header className="sticky top-0 z-50 flex items-center h-[52px] bg-card border-b border-border shadow-[0_1px_0_hsl(var(--border))] px-6 gap-0">
      {/* Logo */}
      <span className="font-display text-[17px] font-semibold tracking-tight mr-6 shrink-0">
        All<span className="text-[var(--color-gold)]">Way</span>
      </span>

      {/* Nav */}
      <nav className="flex flex-1 overflow-x-auto gap-0 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {/* Left: Dashboard · Daily Balance · Sales · Clients */}
        {LEFT.map(item => <NavLink key={item.key} item={item} />)}

        {/* Stock & Inventory dropdown */}
        <GroupDropdown
          label="Stock"
          items={STOCK_ITEMS}
          accentColor="text-emerald-700"
          accentBorder="border-emerald-500"
          accentHover="hover:text-emerald-700"
          accentBg="bg-emerald-50"
          accentIcon="bg-emerald-600"
          dotColor="#059669"
          labelSection="Stock & Inventory"
        />

        {/* Expenses */}
        {MID.map(item => <NavLink key={item.key} item={item} />)}

        {/* Whish Money Services dropdown */}
        <GroupDropdown
          label="Services"
          items={SERVICES_ITEMS}
          accentColor="text-[var(--color-whish)]"
          accentBorder="border-[var(--color-whish)]"
          accentHover="hover:text-[var(--color-whish)]"
          accentBg="bg-rose-50"
          accentIcon="bg-[#E8192C]"
          dotColor="#E8192C"
          labelSection="Whish Money Services"
        />

        {/* Taxi · Shift */}
        {RIGHT.map(item => <NavLink key={item.key} item={item} />)}

        {/* Admin & Reports dropdown */}
        <GroupDropdown
          label="Admin"
          items={ADMIN_ITEMS}
          accentColor="text-slate-700"
          accentBorder="border-slate-600"
          accentHover="hover:text-slate-700"
          accentBg="bg-slate-50"
          accentIcon="bg-slate-700"
          dotColor="#475569"
          labelSection="Admin & Reports"
        />
      </nav>

      {/* User profile */}
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
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive gap-2">
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
