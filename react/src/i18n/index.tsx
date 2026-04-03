import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import en from './locales/en.json'
import ru from './locales/ru.json'

export type Locale = 'en' | 'ru'

const translations: Record<Locale, Record<string, any>> = { en, ru }

function getNested(obj: Record<string, any>, path: string): string {
  const keys = path.split('.')
  let current: any = obj
  for (const key of keys) {
    if (current == null) return path
    current = current[key]
  }
  return typeof current === 'string' ? current : path
}

function interpolate(template: string, params?: Record<string, any>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key]
    return val != null ? String(val) : `{${key}}`
  })
}

interface I18nValue {
  locale: Locale
  t: (key: string, params?: Record<string, any>) => string
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('locale') as Locale | null
    return stored ?? 'en'
  })

  useEffect(() => {
    localStorage.setItem('locale', locale)
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((l: Locale) => setLocaleState(l), [])

  const t = useCallback(
    (key: string, params?: Record<string, any>) => {
      const dict = translations[locale] ?? translations.en
      const value = getNested(dict, key)
      return interpolate(value, params)
    },
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
