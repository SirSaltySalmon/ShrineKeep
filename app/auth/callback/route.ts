import { createServerClient } from "@supabase/ssr"
import type { CookieMethodsServer } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Auth callback must set session cookies on the redirect response.
 * cookies().set() in Route Handlers is not sent with NextResponse.redirect(),
 * so we create the response first and use a Supabase client that writes
 * cookies to that response.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const redirectTo = new URL("/dashboard", request.url)

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  const response = NextResponse.redirect(redirectTo)

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        // NextResponse.cookies.set() defaults to current request path (/auth/callback),
        // so session cookies would not be sent to /dashboard. Force path: '/' so they
        // are sent on all subsequent requests.
        const opts = { ...options, path: "/" } as {
          path?: string
          maxAge?: number
          httpOnly?: boolean
          secure?: boolean
          sameSite?: "lax" | "strict" | "none"
        }
        response.cookies.set(name, value, opts)
      })
    },
  }

  const options: { cookies: CookieMethodsServer } = { cookies: cookieMethods }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  return response
}
