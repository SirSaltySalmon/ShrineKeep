import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LandingHeroImage } from "@/components/landing-hero-image"
import { Floating } from "@/components/floating"
import { ScrollReveal } from "@/components/scroll-reveal"
import { SiteLogo } from "@/components/site-logo"

// Fill in your repo URL for the Contribute button
const GITHUB_REPO_URL = "https://github.com/SirSaltySalmon/ShrineKeep"

export default function LandingPage() {
  return (
    <div className="min-h-screen min-w-[360px] bg-background">
      {/* Navigation - container + fluid like rest of app */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <ScrollReveal delayMs={50} className="w-full">
          <div className="container mx-auto px-4 py-3 sm:py-4 flex gap-5 justify-between items-center min-w-0 overflow-x-auto">
            <SiteLogo
              href="/landing"
              className="shrink-0 hover:opacity-90 gap-2 sm:gap-2.5"
              iconClassName="h-8 w-8 sm:h-9 sm:w-9"
              textClassName="text-fluid-xl sm:text-2xl font-semibold"
            />
            <div className="flex gap-3 sm:gap-6 items-center shrink-0">
              <a
                href="#contact"
                className="text-muted-foreground hover:text-foreground transition-colors text-fluid-base"
              >
                Contact
              </a>
              <Button asChild variant="ghost" size="sm" className="text-fluid-base">
                <Link href="/auth/login">Log In</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="rounded-lg text-fluid-base text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Link href="/auth/signup">Sign Up</Link>
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </nav>

      {/* Hero Section - container, responsive padding & typography */}
      <main className="container mx-auto px-4 pt-20 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 relative overflow-hidden">

        {/* Motto: scales with viewport */}
        <div className="mb-8 sm:mb-12 md:mb-16">
          <div className="flex flex-col gap-1 items-center w-full ">
            <ScrollReveal delayMs={0} className="w-full">
              <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-6 items-baseline justify-center">
                <span
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl uppercase tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-bebas-neue), sans-serif" }}
                >
                  Consumerism
                </span>
                <span
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl italic text-foreground"
                  style={{ fontFamily: "var(--font-playfair-display), serif", fontWeight: 900 }}
                >
                  has
                </span>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={120} className="w-full">
              <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-6 items-baseline justify-center">
                <span
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl text-foreground"
                  style={{ fontFamily: "var(--font-roboto), sans-serif", fontWeight: 700 }}
                >
                  never
                </span>
                <span
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-foreground"
                  style={{ fontFamily: "var(--font-merriweather), Georgia, serif" }}
                >
                  been
                </span>
                <span
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl italic text-foreground"
                  style={{ fontFamily: "var(--font-source-serif-4), serif", fontWeight: 900 }}
                >
                  this
                </span>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={240} className="w-full">
              <div className="flex justify-center">
                <span
                  className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-10xl 2xl:text-[12rem] font-semibold tracking-tight text-foreground relative inline-block leading-none after:absolute after:content-[''] after:left-0 after:-bottom-3 after:h-[3px] after:w-full after:bg-primary after:opacity-50 after:rounded-full before:absolute before:content-[''] before:-inset-6 before:bg-primary/10 before:blur-2xl before:opacity-70 before:-z-10"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  organized.
                </span>
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* Hero images: stacked on small screens, same row on larger — full width */}
        <ScrollReveal delayMs={320} className="w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
            <Floating amplitudePx={12} durationSec={14} className="w-full p-1">
              <div className="min-w-0 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl border border-border bg-muted transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:border-border/70">
                <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
                  <LandingHeroImage src_index={0} />
                </div>
              </div>
            </Floating>
            <Floating amplitudePx={12} durationSec={16} className="w-full p-1">
              <div className="min-w-0 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl border border-border bg-muted transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:border-border/70">
                <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
                  <LandingHeroImage src_index={1} />
                </div>
              </div>
            </Floating>
          </div>
        </ScrollReveal>

        {/* CTA Section */}
        <ScrollReveal delayMs={520} className="w-full">
          <div className="mt-10 sm:mt-14 md:mt-16 flex flex-wrap gap-3 sm:gap-6 items-center justify-center">
            <Button
              asChild
              size="lg"
              className="rounded-lg text-fluid-base sm:text-fluid-lg px-6 sm:px-8 py-3 sm:py-4 text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Link href="/auth/signup">Get Started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-lg text-fluid-base sm:text-fluid-lg px-6 sm:px-8 py-3 sm:py-4 border-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Link href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                Contribute
              </Link>
            </Button>
          </div>
        </ScrollReveal>
      </main>

      {/* Introduction to the project */}
      <section
        id="introduction"
        className="min-h-[40vh] sm:min-h-[50vh] bg-light-muted flex items-center justify-center border-t border-border scroll-mt-20"
      >
        <div className="container mx-auto px-4 py-12 sm:py-16 w-full space-y-12 sm:space-y-16">
          {/* Image left, text right */}
          <ScrollReveal delayMs={0} className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">
              <div className="min-w-0 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl border border-border bg-muted order-2 md:order-1 transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:border-border/70">
                <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
                  <LandingHeroImage src_index={2} />
                </div>
              </div>
              <div className="flex flex-col justify-center order-1 md:order-2">
                <h2 className="text-fluid-xl sm:text-fluid-2xl font-semibold text-foreground">
                  ShrineKeep is a versatile webapp to track completion, values, and spending for any collection of items. With beautiful custom exportable themes.
                </h2>
              </div>
            </div>
          </ScrollReveal>

          {/* Text left, image right */}
          <ScrollReveal delayMs={140} className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">
              <div className="flex flex-col justify-center text-right">
                <h2 className="text-fluid-xl sm:text-fluid-2xl font-semibold text-foreground">
                  Organize anything with boxes, tags, image search, value tracking, public wishlists, and more.
                </h2>
              </div>
              <div className="min-w-0 rounded-xl sm:rounded-2xl overflow-hidden shadow-xl border border-border bg-muted transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:border-border/70">
                <div className="w-full relative" style={{ aspectRatio: "1649 / 761" }}>
                  <LandingHeroImage src_index={3} />
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Contact - container + fluid; scroll target for nav "Contact" */}
      <section
        id="contact"
        className="min-h-[40vh] sm:min-h-[50vh] bg-light-muted flex items-center justify-center border-t border-border scroll-mt-20"
      >
        <ScrollReveal delayMs={0} className="w-full">
          <div className="container mx-auto px-4 text-center py-12 sm:py-16 max-w-2xl">
            <h2 className="text-fluid-xl sm:text-fluid-2xl font-semibold text-foreground mb-4">Contact</h2>
            <div className="text-muted-foreground text-fluid-sm sm:text-fluid-base space-y-2 text-left max-w-md mx-auto text-center">
              {/* Template: replace with your contact details */}
              <p>Made by Binh-Khang Nguyen</p>
              <p>Email: binhkhang.work@gmail.com</p>
              <p>Discord: sirsaltysalmon</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="container mx-auto px-4 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-fluid-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ShrineKeep</p>
          <div className="flex items-center gap-4">
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">
              Terms and Conditions
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
