import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/** Next.js 15+ cookies() is async; use with createServerClient for SSR/Route Handlers. */
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll from Server Component read-only context can be ignored when middleware refreshes sessions
          }
        },
      },
    }
  )
}
