import Link from "next/link"
import { ArrowRight, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollReveal } from "@/components/scroll-reveal"
import { SiteLogo } from "@/components/site-logo"
import { HeroMotto } from "@/components/landing/hero-motto"
import { MockDashboard } from "@/components/landing/mock-dashboard"
import { BlindBoxGame } from "@/components/landing/blind-box-game"
import { HARD_SHADOW, LANDING_FONT as FONT } from "@/lib/landing/tokens"
import { FREE_TIER_CAP, PRO_MONTHLY_PRICE_USD } from "@/lib/subscription"
import { landingFontClasses } from "./fonts"

const GITHUB_REPO_URL = "https://github.com/SirSaltySalmon/ShrineKeep"

// The motto's mixed-type rule carries through the page: display lines borrow a different
// catalog face each time (docs/DESIGN.md, "Marketing exception").

/**
 * CTA label size. Lives on the link, not the Button: tailwind-merge reads `text-fluid-*`
 * as a colour utility and would drop the button's text colour.
 */
const CTA_TEXT = "text-fluid-base sm:text-fluid-lg"

const MARQUEE: { text: string; style: React.CSSProperties }[] = [
  { text: "MODEL KITS", style: { fontFamily: FONT.bebas, fontSize: "1.25em", letterSpacing: "0.02em" } },
  { text: "vinyl", style: { fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 } },
  { text: "trading cards", style: { fontFamily: FONT.roboto, fontWeight: 700 } },
  { text: "keyboards", style: { fontFamily: FONT.mono, fontWeight: 600, fontSize: "0.85em" } },
  { text: "sneakers", style: { fontFamily: FONT.merriweather, fontWeight: 700, fontSize: "0.9em" } },
  { text: "fountain pens", style: { fontFamily: FONT.sourceItalic, fontStyle: "italic", fontWeight: 900 } },
  { text: "BLIND BOXES", style: { fontFamily: FONT.bebas, fontSize: "1.25em", letterSpacing: "0.02em" } },
  { text: "film cameras", style: { fontFamily: FONT.outfit, fontWeight: 700 } },
  { text: "manga", style: { fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 } },
  { text: "watches", style: { fontFamily: FONT.roboto, fontWeight: 700 } },
  { text: "plushies", style: { fontFamily: FONT.lora, fontWeight: 700 } },
  { text: "whatever it is you do", style: { fontFamily: FONT.mono, fontWeight: 600, fontSize: "0.85em" } },
]

const FEATURES: { title: string; body: string; font: React.CSSProperties; chip: string }[] = [
  {
    title: "Boxes inside boxes",
    body: "Nest boxes like folders and drag items or whole boxes between them. Tags, filters and search find the rest.",
    font: { fontFamily: FONT.bebas, fontSize: "1.35em", letterSpacing: "0.01em", textTransform: "uppercase" },
    chip: "tag-red",
  },
  {
    title: "Worth vs. paid",
    body: "Every item tracks its value and what you paid, graphed over time. Your numbers change the moment you tick something off your wishlist!",
    font: { fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 },
    chip: "tag-green",
  },
  {
    title: "Yours to theme and share",
    body: "Every colour, both fonts and the corner radius, exportable as a file. Share a wishlist by link, or put a showcase on a public profile.",
    font: { fontFamily: FONT.merriweather, fontWeight: 700, fontSize: "0.86em" },
    chip: "tag-violet",
  },
  {
    title: "Bring your own agent",
    body: "In a browser with WebMCP, your own AI agent can research a set, fill in a box and update values. You approve the changes before anything goes.",
    font: { fontFamily: FONT.mono, fontWeight: 600, fontSize: "0.8em" },
    chip: "tag-blue",
  },
]

const RECEIPT_LINES = [
  "Nested boxes",
  "Value + spend graphs",
  "Wishlist + share link",
  "Tags, filters, search",
  "Theme editor + export",
  "Agentic management support"
]

/** `onTint` is for a section with a tag-colour wash, where muted text falls under 4.5:1. */
function SectionLabel({ children, onTint = false }: { children: React.ReactNode; onTint?: boolean }) {
  return (
    <p
      className={`text-fluid-xs font-semibold uppercase tracking-[0.2em] ${onTint ? "text-foreground/80" : "text-muted-foreground"}`}
      style={{ fontFamily: FONT.mono }}
    >
      {children}
    </p>
  )
}

/** For links with `target="_blank"`: says so to assistive tech without changing the visible label. */
function NewTabHint() {
  return <span className="sr-only"> (opens in a new tab)</span>
}

export default function LandingPage() {
  return (
    <div id="top" className={`min-h-screen min-w-[360px] overflow-x-clip bg-background ${landingFontClasses}`}>
      <nav className="fixed left-0 right-0 top-0 z-50 border-b-2 border-foreground bg-background/90 backdrop-blur-sm">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-2 overflow-x-auto px-4 py-3 sm:gap-5">
          <SiteLogo
            href="/landing"
            className="shrink-0 gap-1.5 hover:opacity-90 sm:gap-2.5"
            iconClassName="h-7 w-7 sm:h-9 sm:w-9"
            textClassName="text-fluid-xl sm:text-2xl font-semibold"
          />
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-5">
            <a href="#demo" className="hidden text-fluid-base text-muted-foreground transition-colors hover:text-foreground md:block">
              Demo
            </a>
            <a href="#blind-box" className="hidden text-fluid-base text-muted-foreground transition-colors hover:text-foreground md:block">
              Game
            </a>
            <a href="#contact" className="text-fluid-base text-muted-foreground transition-colors hover:text-foreground">
              Contact
            </a>
            <Button asChild variant="ghost" size="sm" className="text-fluid-base">
              <Link href="/auth/login">Log In</Link>
            </Button>
            {/* Size on the link, as with CTA_TEXT below. */}
            <Button asChild size="sm" className="rounded-lg">
              <Link href="/auth/signup" className="text-fluid-base">
                Sign Up
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero: the poster */}
        <section
          className="relative border-b-2 border-foreground"
          style={{
            backgroundImage: "radial-gradient(hsl(var(--foreground) / 0.1) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="container mx-auto px-4 pb-12 pt-24 sm:pb-16 sm:pt-28">
            {/*
              The poster is ~0.53x as tall as it is wide, whatever faces the motto is set in (its
              lines have fixed heights). Capping the hero column by viewport height keeps the pitch
              and CTAs above the fold on short, wide screens. Below a 48rem floor the fold is lost
              anyway, so the poster stops shrinking.
            */}
            <div className="mx-auto w-full" style={{ maxWidth: "max(48rem, calc((100svh - 19.5rem) * 1.89))" }}>
              <HeroMotto freeItemCap={FREE_TIER_CAP} />

              {/*
                Wraps on the column's own width, not a viewport breakpoint: this column can be far
                narrower than the screen, and a breakpoint would squeeze the pitch beside the buttons.
              */}
              <div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-6 sm:mt-10">
                <p className="max-w-xl flex-1 basis-[24rem] text-fluid-lg text-foreground sm:text-fluid-xl">
                  ShrineKeep is the collection manager for people dropping big money on their hobby. Powerful file system-inspired management, financial tracking, shareable wishlists, and agentic assistance — all in your favorite color.
                </p>
                <div className="flex flex-wrap items-start gap-3 sm:gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <Button
                      asChild
                      size="lg"
                      className={`rounded-lg border-2 border-foreground px-6 text-primary-foreground sm:px-8 ${HARD_SHADOW} motion-safe:hover:-translate-y-0.5`}
                    >
                      <Link href="/judge" className={CTA_TEXT}>
                        Try ShrineKeep
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                    <p className="text-fluid-sm text-muted-foreground">No signup required</p>
                  </div>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-lg border-2 border-foreground bg-background px-6 sm:px-8"
                  >
                    <Link href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={CTA_TEXT}>
                      Contribute
                      <NewTabHint />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marquee: who it's for */}
        <div
          role="group"
          aria-label="Works for any collection"
          className="overflow-hidden border-b-2 border-foreground bg-foreground py-3 text-background sm:py-4"
        >
          <div className="sk-landing-marquee flex w-max items-center whitespace-nowrap text-2xl sm:text-4xl">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {MARQUEE.map((entry) => (
                  <span key={entry.text} className="flex items-center">
                    <span className="px-4 leading-none sm:px-6" style={entry.style}>
                      {entry.text}
                    </span>
                    <span aria-hidden className="text-base sm:text-xl" style={{ color: "hsl(var(--tag-yellow))" }}>
                      ✦
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Live demo */}
        <section id="demo" className="scroll-mt-20 border-b-2 border-foreground bg-light-muted">
          <div className="container mx-auto px-4 py-14 sm:py-20">
            <ScrollReveal>
              <SectionLabel>Live demo / very clickable</SectionLabel>
              <h2 className="mt-3 max-w-4xl text-4xl leading-[1.02] text-foreground sm:text-6xl">
                <span style={{ fontFamily: FONT.roboto, fontWeight: 700 }}>This is </span>
                <span style={{ fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 }}>not</span>
                <span style={{ fontFamily: FONT.roboto, fontWeight: 700 }}> a </span>
                <span style={{ fontFamily: FONT.bebas, fontSize: "1.2em", letterSpacing: "0.01em" }}>SCREENSHOT.</span>
              </h2>
              <p className="mt-4 max-w-2xl text-fluid-lg text-muted-foreground">
               Interact freely and watch your money move. Available in Comic Sans!
              </p>
            </ScrollReveal>
            <ScrollReveal delayMs={120} threshold={0.05} className="mt-8 sm:mt-10">
              <MockDashboard />
            </ScrollReveal>
          </div>
        </section>

        {/* Features: one grid, hard rules, a different face per cell */}
        <section id="features" className="scroll-mt-20 border-b-2 border-foreground bg-background">
          <div className="container mx-auto px-4 py-14 sm:py-20">
            <ScrollReveal>
              <SectionLabel>What&apos;s in the box</SectionLabel>
              <h2 className="mt-3 max-w-4xl text-4xl leading-[1.02] text-foreground sm:text-6xl">
                <span style={{ fontFamily: FONT.merriweather, fontWeight: 700, fontSize: "0.86em" }}>Your shrine deserves </span>
                <span style={{ fontFamily: FONT.bebas, fontSize: "1.2em", letterSpacing: "0.01em" }}> MORE </span>
                <span style={{ fontFamily: FONT.sourceItalic, fontStyle: "italic", fontWeight: 900 }}>than a spreadsheet.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delayMs={120} threshold={0.05} className="mt-8 sm:mt-10">
              <ol className={`grid grid-cols-1 gap-0.5 overflow-hidden rounded-lg border-2 border-foreground bg-foreground sm:grid-cols-2 xl:grid-cols-4 ${HARD_SHADOW}`}>
                {FEATURES.map((feature, i) => (
                  <li
                    key={feature.title}
                    className="group bg-background p-5 transition-colors hover:bg-light-muted sm:p-6"
                  >
                    <span
                      className="inline-block rounded-md border-2 border-foreground px-2 py-0.5 text-xs font-semibold text-foreground transition-transform motion-safe:group-hover:-rotate-6"
                      style={{ fontFamily: FONT.mono, background: `hsl(var(--${feature.chip}))` }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-4 text-2xl leading-tight text-foreground sm:text-3xl">
                      <span style={feature.font}>{feature.title}</span>
                    </h3>
                    <p className="mt-2 text-fluid-base text-muted-foreground">{feature.body}</p>
                  </li>
                ))}
              </ol>
            </ScrollReveal>
          </div>
        </section>

        {/* Game */}
        <section
          id="blind-box"
          className="scroll-mt-20 border-b-2 border-foreground"
          style={{ background: "hsl(var(--tag-yellow) / 0.22)" }}
        >
          <div className="container mx-auto px-4 py-14 sm:py-20">
            <ScrollReveal>
              <SectionLabel onTint>Intermission</SectionLabel>
              <h2 className="mt-3 max-w-4xl text-4xl leading-[1.02] text-foreground sm:text-6xl">
                <span style={{ fontFamily: FONT.bebas, fontSize: "1.2em", letterSpacing: "0.01em" }}>JUST ONE MORE </span>
                <span style={{ fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 }}>pull...</span>
              </h2>
              <p className="mt-4 max-w-2xl text-fluid-lg text-foreground/80">
                We love gambling. Complete the set before your wallet runs dry!
              </p>
            </ScrollReveal>
            <ScrollReveal delayMs={120} threshold={0.05} className="mt-8 sm:mt-10">
              <BlindBoxGame />
            </ScrollReveal>
          </div>
        </section>

        {/* Closing pitch + receipt */}
        <section className="border-b-2 border-foreground bg-foreground text-background">
          <div className="container mx-auto grid grid-cols-1 items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <ScrollReveal>
              <h2 className="text-5xl leading-[0.98] sm:text-7xl">
                <span style={{ fontFamily: FONT.playfairItalic, fontStyle: "italic", fontWeight: 900 }}>Go on... </span>
                <span style={{ fontFamily: FONT.bebas, fontSize: "1.2em", letterSpacing: "0.01em" }}>get ORGANIZED </span>
              </h2>
              <p className="mt-5 max-w-xl text-fluid-lg text-background/75">
                Rather not spend time making an account yet? Open the sandbox and poke around, no sign up required.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="rounded-lg border-2 border-background bg-background px-6 text-foreground hover:bg-background/90 sm:px-8"
                >
                  <Link href="/auth/signup" className={CTA_TEXT}>Start your shrine</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-lg border-2 border-background bg-transparent px-6 text-background hover:bg-background hover:text-foreground sm:px-8"
                >
                  <Link href="/judge" className={CTA_TEXT}>Open the sandbox</Link>
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={150} className="mx-auto w-full max-w-[21rem] lg:mx-0">
              <div
                className="rotate-2 bg-background px-5 pb-8 pt-5 text-foreground transition-transform duration-300 motion-safe:hover:rotate-0"
                style={{
                  fontFamily: FONT.mono,
                  WebkitMask: "radial-gradient(6px at 50% 100%, transparent 96%, black) 50% / 12px 100%",
                  mask: "radial-gradient(6px at 50% 100%, transparent 96%, black) 50% / 12px 100%",
                }}
              >
                <p className="text-center text-sm font-semibold tracking-[0.2em]">SHRINEKEEP</p>
                <p className="text-center text-[11px] text-muted-foreground">consumerism, organized</p>
                <div className="my-3 border-t-2 border-dashed border-foreground/40" />
                <ul className="space-y-1.5 text-xs">
                  {RECEIPT_LINES.map((line) => (
                    <li key={line} className="flex justify-between gap-3">
                      <span>1 × {line}</span>
                      <span>$0.00</span>
                    </li>
                  ))}
                </ul>
                <div className="my-3 border-t-2 border-dashed border-foreground/40" />
                <ul className="space-y-1.5 text-xs">
                  <li className="flex justify-between gap-3">
                    <span>First {FREE_TIER_CAP} items</span>
                    <span>$0.00</span>
                  </li>
                  <li className="flex justify-between gap-3 text-muted-foreground">
                    <span>Pro, unlimited (optional)</span>
                    <span>${PRO_MONTHLY_PRICE_USD}/mo</span>
                  </li>
                </ul>
                <div className="my-3 border-t-2 border-dashed border-foreground/40" />
                <p className="flex justify-between text-sm font-semibold">
                  <span>DUE TODAY</span>
                  <span style={{ color: "hsl(var(--value-color))" }}>$0.00</span>
                </p>
                <div
                  className="mt-4 h-9 w-full"
                  aria-hidden
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, hsl(var(--foreground)) 0 2px, transparent 2px 5px, hsl(var(--foreground)) 5px 6px, transparent 6px 9px, hsl(var(--foreground)) 9px 12px, transparent 12px 14px)",
                  }}
                />
                <p className="mt-2 text-center text-[11px] tracking-widest text-muted-foreground">THANK YOU FOR HAVING FUN !!!</p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Contact: scroll target for the nav link */}
        <section id="contact" className="scroll-mt-20 bg-background">
          <ScrollReveal className="w-full">
            <div className="container mx-auto grid grid-cols-1 gap-6 px-4 py-14 sm:py-20 md:grid-cols-2 md:items-end">
              <div>
                <SectionLabel>Contact</SectionLabel>
                <h2 className="mt-3 text-4xl leading-[1.02] text-foreground sm:text-5xl">
                  <span style={{ fontFamily: FONT.lora, fontWeight: 700 }}>Made by </span>
                  <span style={{ fontFamily: FONT.bebas, fontSize: "1.2em", letterSpacing: "0.01em" }}>A DUDE</span>
                </h2>
              </div>
              <dl className="space-y-2 text-fluid-base text-foreground" style={{ fontFamily: FONT.mono }}>
                <div className="flex flex-wrap gap-x-3 border-b border-border pb-2">
                  <dt className="w-20 text-muted-foreground">Who</dt>
                  <dd>Binh-Khang Nguyen</dd>
                </div>
                <div className="flex flex-wrap gap-x-3 border-b border-border pb-2">
                  <dt className="w-20 text-muted-foreground">Email</dt>
                  <dd>
                    <a href="mailto:binhkhang.work@gmail.com" className="underline underline-offset-4 hover:no-underline">
                      binhkhang.work@gmail.com
                    </a>
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-3 border-b border-border pb-2">
                  <dt className="w-20 text-muted-foreground">Discord</dt>
                  <dd>sirsaltysalmon</dd>
                </div>
                <div className="flex flex-wrap gap-x-3">
                  <dt className="w-20 text-muted-foreground">Source</dt>
                  <dd>
                    <a
                      href={GITHUB_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 hover:no-underline"
                    >
                      github.com/SirSaltySalmon/ShrineKeep
                      <NewTabHint />
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </ScrollReveal>
        </section>
      </main>

      <footer className="border-t-2 border-foreground bg-background">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-6 text-fluid-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ShrineKeep</p>
          <a href="#top" className="hidden items-center gap-1 hover:text-foreground sm:flex">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Back to the top
          </a>
          <div className="flex items-center gap-4">
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              Terms and Conditions
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
