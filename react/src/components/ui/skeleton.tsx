import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted/70', className)}
      {...props}
    />
  )
}

function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4 w-full',
            i === lines - 1 && 'w-4/5',
            className
          )}
        />
      ))}
    </div>
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  )
}

function SkeletonRow({ colSpan = 1, className }: { colSpan?: number; className?: string }) {
  return (
    <tr className={cn('border-b border-border/50 last:border-0', className)}>
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      </td>
    </tr>
  )
}

function SkeletonTable({
  rows = 5,
  cols = 1,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} colSpan={cols} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonRow, SkeletonTable }
