import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-fluid-4xl font-bold">Welcome to ShrineKeep</h1>
          <p className="text-fluid-lg text-muted-foreground">
            Consumerism has never been this organized.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" variant="outline" className="text-fluid-base">
            <Link href="/auth/signup">Sign Up</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-fluid-base">
            <Link href="/auth/login">Log In</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
