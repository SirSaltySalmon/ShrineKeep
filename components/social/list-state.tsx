"use client"

import { Button } from "@/components/ui/button"
import { SocialRequestError, describeSocialError } from "@/lib/social/client"

export function socialErrorMessage(error: unknown): string {
  return error instanceof SocialRequestError ? describeSocialError(error.error) : "Something went wrong. Try again."
}

export function ListState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
  formatError = socialErrorMessage,
  children,
}: {
  loading: boolean
  error: unknown
  empty: boolean
  emptyText: string
  onRetry: () => void
  formatError?: (error: unknown) => string
  children: React.ReactNode
}) {
  if (loading) return <p className="text-fluid-sm text-muted-foreground">Loading…</p>
  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-fluid-sm text-destructive">{formatError(error)}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  if (empty) return <p className="text-fluid-sm text-muted-foreground">{emptyText}</p>
  return children
}

export function PageControls({
  hasMore,
  canBack,
  onBack,
  onNext,
  disabled,
}: {
  hasMore: boolean
  canBack: boolean
  onBack: () => void
  onNext: () => void
  disabled: boolean
}) {
  if (!hasMore && !canBack) return null
  return (
    <div className="flex gap-2 pt-2">
      <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={disabled || !canBack}>
        Previous
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={disabled || !hasMore}>
        Next
      </Button>
    </div>
  )
}
