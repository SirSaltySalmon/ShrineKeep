import { notFound } from "next/navigation"

/**
 * Catches any path with at least one segment that doesn't match a more specific
 * route (e.g. /auth/login/huh) and triggers the root not-found.tsx so users
 * see our custom 404 instead of the browser's default HTTP 404.
 * Required catch-all (not optional) so "/" stays handled by app/page.tsx.
 */
export default function CatchAllNotFound() {
  notFound()
}
