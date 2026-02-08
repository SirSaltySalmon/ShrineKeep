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
    <nav className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/dashboard" className="flex items-center space-x-2 hover:opacity-80">
              <Package className="h-5 w-5" />
              <span className="font-semibold">ShrineKeep</span>
            </Link>
            <Link href="/dashboard" className="text-sm hover:underline">
              Collections
            </Link>
            <Link href="/wishlist" className="text-sm hover:underline flex items-center space-x-1">
              <Heart className="h-4 w-4" />
              <span>Wishlist</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {name && (
              <span className="text-sm text-muted-foreground">{name}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
