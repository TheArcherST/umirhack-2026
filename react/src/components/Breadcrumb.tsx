import React from 'react'
import { cn } from '@/lib/utils'

export interface BreadcrumbSegment {
  label: string
  active?: boolean
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[]
  className?: string
}

export function Breadcrumb({ segments, className }: BreadcrumbProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="text-muted-foreground/40 text-sm">/</span>
          )}
          {seg.active ? (
            <span className="text-xs font-semibold text-foreground px-2 py-0.5 rounded bg-foreground/10">
              {seg.label}
            </span>
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {seg.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
