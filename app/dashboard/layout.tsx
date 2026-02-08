import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Package, Heart } from "lucide-react"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4">
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
        </div>
      </nav>
      {children}
    </div>
  )
}
