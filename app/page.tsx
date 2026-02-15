import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { LandingHeroImage } from "@/components/landing-hero-image"

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-semibold text-foreground">
            ShrineKeep
          </Link>
          <div className="flex gap-6 items-center">
            <a
              href="#contact"
              className="text-muted-foreground hover:text-foreground transition-colors text-fluid-base"
            >
              Contact
            </a>
            <Button asChild variant="ghost" size="sm" className="text-fluid-base">
              <Link href="/auth/login">Log In</Link>
            </Button>
            <Button asChild size="sm" className="rounded-lg text-fluid-base text-primary-foreground">
              <Link href="/auth/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Motto with theme-aligned typography */}
          <div className="mb-16">
            <div className="flex flex-col gap-4 items-start max-w-5xl">
              <div className="flex flex-wrap gap-6 items-baseline">
                <span
                  className="text-6xl md:text-7xl lg:text-8xl uppercase tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-merriweather), Georgia, serif" }}
                >
                  Consumerism
                </span>
                <span
                  className="text-5xl md:text-6xl lg:text-7xl italic text-foreground"
                  style={{ fontFamily: "var(--font-playfair-display), serif", fontWeight: 900 }}
                >
                  has
                </span>
              </div>
              <div className="flex flex-wrap gap-6 items-baseline">
                <span
                  className="text-6xl md:text-7xl lg:text-8xl text-foreground"
                  style={{ fontFamily: "var(--font-roboto), sans-serif", fontWeight: 700 }}
                >
                  never
                </span>
                <span
                  className="text-5xl md:text-6xl lg:text-7xl text-foreground"
                  style={{ fontFamily: "var(--font-bebas-neue), sans-serif" }}
                >
                  been
                </span>
                <span
                  className="text-5xl md:text-6xl lg:text-7xl italic text-foreground"
                  style={{ fontFamily: "var(--font-playfair-display), serif", fontWeight: 900 }}
                >
                  this
                </span>
              </div>
              <div>
                <span
                  className="text-8xl md:text-9xl lg:text-[12rem] font-normal text-foreground"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  organized.
                </span>
              </div>
            </div>
          </div>

          {/* Featured images: 1649×761 (wide banner) */}
          <div className="mt-12 rounded-2xl overflow-hidden shadow-2xl border border-border bg-muted w-full max-w-[1649px]">
            <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
              <LandingHeroImage src_index={0} />
            </div>
          </div>
          <div className="mt-12 rounded-2xl overflow-hidden shadow-2xl border border-border bg-muted w-full max-w-[1649px] ml-auto">
            <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
              <LandingHeroImage src_index={1} />
            </div>
          </div>

          {/* CTA Section */}
          <div className="mt-16 flex flex-wrap gap-4 sm:gap-6 items-center">
            <Button asChild size="lg" className="rounded-lg text-fluid-lg px-8 py-4 text-primary-foreground">
              <Link href="/auth/signup">Get Started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-lg text-fluid-lg px-8 py-4 border-2"
            >
              <Link href="#contact">Learn More</Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Contact / More sections placeholder */}
      <section
        id="contact"
        className="min-h-[50vh] bg-muted/50 flex items-center justify-center border-t border-border"
      >
        <div className="text-center px-6 py-16 max-w-2xl">
          <h2 className="text-fluid-2xl font-semibold text-foreground mb-2">More coming soon</h2>
          <p className="text-muted-foreground text-fluid-base">
            ShrineKeep helps you track completion, values, and spending for any collection. Sign up
            to get started.
          </p>
          <Button asChild className="mt-6 rounded-lg">
            <Link href="/auth/signup">Sign Up</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
