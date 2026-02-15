import type { Metadata } from "next"
import { Suspense } from "react"
import {
  Inter,
  Noto_Sans,
  Nunito_Sans,
  Figtree,
  Roboto,
  Raleway,
  DM_Sans,
  Public_Sans,
  Outfit,
  JetBrains_Mono,
  Lora,
  Merriweather,
  Playfair_Display,
  Source_Serif_4,
} from "next/font/google"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { cn } from "@/lib/utils"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { CopiedItemProvider } from "@/lib/copied-item-context"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const geistSans = GeistSans
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", weight: ["400", "500", "600", "700"] })
const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito-sans", weight: ["400", "600", "700"] })
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", weight: ["400", "500", "600", "700"] })
const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto", weight: ["400", "500", "700"] })
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway", weight: ["400", "500", "600", "700"] })
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600", "700"] })
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", weight: ["400", "500", "600", "700"] })
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["400", "500", "600", "700"] })
const geistMono = GeistMono
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", weight: ["400", "500", "600"] })
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", weight: ["400", "500", "600", "700"] })
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-merriweather", weight: ["400", "700"] })
const playfairDisplay = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair-display", weight: ["400", "500", "600", "700"] })
const sourceSerif4 = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-4", weight: ["400", "500", "600", "700"] })

const fontVariableClasses = cn(
  inter.variable,
  geistSans.variable,
  notoSans.variable,
  nunitoSans.variable,
  figtree.variable,
  roboto.variable,
  raleway.variable,
  dmSans.variable,
  publicSans.variable,
  outfit.variable,
  geistMono.variable,
  jetbrainsMono.variable,
  lora.variable,
  merriweather.variable,
  playfairDisplay.variable,
  sourceSerif4.variable
)

export const metadata: Metadata = {
  title: "ShrineKeep",
  description: "A versatile utility webapp to track completion, values, and spending for any collection of items.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={fontVariableClasses} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <CopiedItemProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </CopiedItemProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
