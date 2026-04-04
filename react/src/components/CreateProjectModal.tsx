import React, { useState, useCallback, useRef, useEffect } from 'react'
import { X, Plus, Loader2, Search } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stubSearchUsers } from '@/api/stubs'
import type { UserSearchResult } from '@/api/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (name: string, members: string[]) => Promise<void>
}

export function CreateProjectModal({ open, onClose, onCreate }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Manual debounce for search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchQuery(q)

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (q.length < 2) { setSearchResults([]); return }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await stubSearchUsers(q)
        const selectedIds = new Set(selectedMembers.map((m) => m.user_id))
        setSearchResults(results.filter((r) => !selectedIds.has(r.user_id)))
      } catch { /* ignore */ }
      finally { setSearching(false) }
    }, 300)
  }

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [])

  const addMember = (user: UserSearchResult) => {
    setSelectedMembers((prev) => [...prev, user])
    setSearchQuery('')
    setSearchResults([])
    searchRef.current?.focus()
  }

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onCreate(name.trim(), selectedMembers.map((m) => m.email))
      handleClose()
    } catch { /* handled by parent */ }
    finally { setLoading(false) }
  }

  const handleClose = () => {
    setName('')
    setSearchQuery('')
    setSearchResults([])
    setSelectedMembers([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('project.createProject')}</DialogTitle>
          <DialogDescription>
            Create a new project and invite team members
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            {/* Project name */}
            <div className="space-y-1.5">
              <Label>{t('project.projectName')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('project.projectNamePlaceholder')}
                autoFocus
                required
              />
            </div>

            {/* Invite members */}
            <div className="space-y-2">
              <Label>{t('member.inviteMember')}</Label>

              {/* Selected members badges */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map((m) => (
                    <div
                      key={m.user_id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/50 text-xs"
                    >
                      <div className="w-4 h-4 rounded-full bg-foreground/15 flex items-center justify-center text-[9px] font-semibold font-mono">
                        {m.name[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground text-[10px]">{m.email}</span>
                      <button
                        type="button"
                        onClick={() => removeMember(m.user_id)}
                        className="ml-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder={t('member.memberEmailPlaceholder')}
                  className="pl-8"
                />
                {searching && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-card shadow-md max-h-40 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.user_id}
                        type="button"
                        onClick={() => addMember(user)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
                      >
                        <div className="w-6 h-6 rounded-full bg-foreground/15 flex items-center justify-center text-xs font-semibold font-mono shrink-0">
                          {user.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        <Plus size={13} className="text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !name.trim()}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : t('project.createProject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
