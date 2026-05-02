import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  xs: 'w-3 h-3 border-[1.5px]',
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
}

export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border-current border-t-transparent animate-spin',
        sizes[size],
        className,
      )}
    />
  )
}

/** Pulsing dots — for background refetch indicator */
export function RefetchDot({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-0.5', className)}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }}
        />
      ))}
    </span>
  )
}
