"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Package, Heart, LogOut } from "lucide-react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

interface AppNavProps {
  name: string | null
}

export default function AppNav({ name }: AppNavProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <nav className="border-b min-w-0">
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="container mx-auto px-4 py-4 min-w-0">
          <div className="flex items-center justify-between gap-4 flex-nowrap min-w-0">
            <div className="flex items-center space-x-4 sm:space-x-6 flex-shrink-0 min-w-0 overflow-hidden">
              <Link href="/dashboard" className="flex items-center space-x-2 hover:opacity-80 shrink-0">
                <Package className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="font-semibold text-fluid-sm truncate">ShrineKeep</span>
              </Link>
              <Link href="/dashboard" className="text-fluid-sm hover:underline whitespace-nowrap">
                <span>Collections</span>
              </Link>
              <Link href="/wishlist" className="text-fluid-sm hover:underline flex items-center space-x-1 whitespace-nowrap">
                <Heart className="h-4 w-4 shrink-0" />
                <span>Wishlist</span>
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
              {name && (
                <span className="text-fluid-sm text-muted-foreground whitespace-nowrap truncate max-w-[120px] sm:max-w-[200px]">{name}</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-fluid-sm text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Log out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
