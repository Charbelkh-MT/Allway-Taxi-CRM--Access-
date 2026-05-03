import { cn } from '@/lib/utils'

export function StatusBadge({ status }: { status: string }) {
  if (status === 'saved')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Saved</span>
  if (status === 'void_requested')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Void requested</span>
  if (status === 'voided')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Voided</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground">{status}</span>
}

export function MethodBadge({ method }: { method: string }) {
  const m = (method || '').toLowerCase()
  if (m.includes('whish'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Whish</span>
  if (m.includes('cash') && m.includes('lbp'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Cash LBP</span>
  if (m.includes('cash'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Cash USD</span>
  if (m.includes('debt'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Debt</span>
  if (m.includes('card'))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">Card</span>
  if (!method) return <span className="text-muted-foreground">—</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground">{method}</span>
}

export function DebtBadge({ status }: { status: string }) {
  if (status === 'Debt')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Debt</span>
  if (status === 'Cash')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Cash</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Unchecked</span>
}

export function RoleBadge({ role }: { role: string }) {
  if (role === 'admin')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Admin</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Staff</span>
}

export function ExpenseStatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Approved</span>
  if (status === 'rejected')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Rejected</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
}

export function UserBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground font-mono', className)}>
      {name}
    </span>
  )
}
