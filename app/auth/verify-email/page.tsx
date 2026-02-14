import { Suspense } from "react"
import VerifyEmailContent from "./verify-email-content"

function VerifyEmailFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 animate-pulse">
        <div className="h-8 bg-muted rounded w-3/4 mx-auto mb-4" />
        <div className="h-4 bg-muted rounded w-full mb-6" />
        <div className="h-10 bg-muted rounded w-full mb-4" />
        <div className="h-10 bg-muted rounded w-full" />
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  )
}
