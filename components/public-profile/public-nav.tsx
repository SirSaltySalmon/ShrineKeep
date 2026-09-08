"use client"

import Link from "next/link"
import AppNav from "@/components/app-nav"
import { Button } from "@/components/ui/button"
import { SiteLogo, SITE_LOGO_STROKE_MATCH_LUCIDE } from "@/components/site-logo"
import { Package } from "lucide-react"

interface PublicNavProps {
  viewerName: string | null
  sandbox: boolean
  loginHref: string
}

/** Navigation represents the viewer. Guests never see the profile owner's name as the signed-in account. */
export function PublicNav({ viewerName, sandbox, loginHref }: PublicNavProps) {
  if (viewerName) {
    return <AppNav name={viewerName} sandbox={sandbox} />
  }

  return (
    <nav className="border-b min-w-0">
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="container mx-auto px-4 py-4 min-w-0">
          <div className="flex items-center justify-between gap-4 flex-nowrap min-w-0">
            <div className="flex items-center space-x-4 sm:space-x-6 flex-shrink-0 layout-shrink-visible">
              <SiteLogo
                href="/landing"
                className="hover:opacity-80 shrink-0"
                iconClassName="h-4 w-4"
                textClassName="text-fluid-sm"
                markStrokeWidth={SITE_LOGO_STROKE_MATCH_LUCIDE}
              />
              <Link href="/dashboard" className="text-fluid-sm hover:underline flex items-center space-x-1 whitespace-nowrap">
                <Package className="h-4 w-4 shrink-0" />
                <span>Dashboard</span>
              </Link>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
