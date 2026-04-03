import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium font-mono transition-colors',
  {
    variants: {
      variant: {
        default: 'border border-border bg-secondary text-secondary-foreground',
        success: 'border border-green-500/20 bg-green-500/10 text-green-400',
        destructive: 'border border-red-500/20 bg-red-500/10 text-red-400',
        warning: 'border border-amber-500/20 bg-amber-500/10 text-amber-400',
        blue: 'border border-blue-500/20 bg-blue-500/10 text-blue-400',
        outline: 'border border-border text-foreground',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
