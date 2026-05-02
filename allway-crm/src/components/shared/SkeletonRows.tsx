import { TableCell, TableRow } from '@/components/ui/table'

const WIDTHS = [72, 48, 84, 56, 68, 40, 80, 52, 76, 44, 88, 60]

interface SkeletonRowsProps {
  cols: number
  rows?: number
}

export function SkeletonRows({ cols, rows = 6 }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} className="skeleton-row hover:bg-transparent border-b border-border/50">
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j} className="py-4">
              <div
                className="h-3 rounded-full"
                style={{ width: `${WIDTHS[(i * cols + j) % WIDTHS.length]}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
