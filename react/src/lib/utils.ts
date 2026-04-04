import {clsx, type ClassValue} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date)
}

export function formatDuration(seconds: number | null): string {
    if (seconds === null) return '—'
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
}

export function timeAgo(dateStr: string, locale = 'en'): string {
    const now = new Date()
    const date = new Date(dateStr)
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    let value: number
    let unit: Intl.RelativeTimeFormatUnit

    if (diff < 60) { value = -diff; unit = 'second' }
    else if (diff < 3600) { value = -Math.floor(diff / 60); unit = 'minute' }
    else if (diff < 86400) { value = -Math.floor(diff / 3600); unit = 'hour' }
    else { value = -Math.floor(diff / 86400); unit = 'day' }

    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
}

export async function copyText(text: string): Promise<boolean> {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    try {
        if (document.execCommand('copy')) {
            return true
        }
    } catch {
        // Fall through to Clipboard API for browsers that reject execCommand.
    } finally {
        document.body.removeChild(textarea)
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // Ignore and return false below.
    }

    return false
}
