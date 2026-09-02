import { createServerClient, type CookieMethodsServer } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

function cookieMethods(request: NextRequest, response: NextResponse): CookieMethodsServer {
  return {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
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
}

export function supabaseOnResponse(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods(request, response) }
  )
}

export function redirectWithCookies(request: NextRequest, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url))
  const supabase = supabaseOnResponse(request, response)
  return { response, supabase }
}
