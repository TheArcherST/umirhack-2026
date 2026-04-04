import { Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useEffect, useRef, useState } from 'react'

interface Props {
  isLoading: boolean
  children: React.ReactNode
}

export function AuthBlurLoader({ isLoading, children }: Props) {
  const { t } = useI18n()
  const [isTransitioning, setIsTransitioning] = useState(isLoading)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      setIsTransitioning(true)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setIsFadingOut(false)
        })
      })
    } else if (isTransitioning && !isLoading) {
      setIsFadingOut(true)
      const timer = setTimeout(() => {
        setIsTransitioning(false)
      }, 500)
      return () => clearTimeout(timer)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isLoading, isTransitioning])

  if (!isTransitioning) return children

  return (
    <div className="relative">
      <div
        className="transition-all duration-500 ease-in-out"
        style={{
          filter: isFadingOut ? 'blur(0)' : 'blur(12px)',
          opacity: isFadingOut ? 1 : 0.2,
          pointerEvents: isFadingOut ? 'auto' : 'none',
        }}
      >
        {children}
      </div>
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl"
        style={{
          opacity: isFadingOut ? 0 : 1,
          pointerEvents: isFadingOut ? 'none' : 'auto',
          transition: 'opacity 0.5s ease-in-out',
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-foreground/80" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    </div>
  )
}
