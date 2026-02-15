import Link from "next/link"
import { Button } from "@/components/ui/button"
import { NotFoundCode } from "@/components/not-found-code"

export default function NotFound() {
  return (
    <div className="min-h-screen min-w-[360px] bg-background flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <h1 className="text-6xl sm:text-7xl font-bold text-foreground tracking-tight">
          404
        </h1>
        <p className="text-lg text-muted-foreground">
          This page doesn&apos;t exist or has been moved.
        </p>

        <div className="rounded-lg border border-border bg-light-muted p-4 text-left">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Path / code from URL
          </p>
          <NotFoundCode />
        </div>

        <p className="text-sm text-muted-foreground">
          If you expected something else here, you can report this path to
          support so we can fix it.
        </p>

        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/landing">Landing</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
