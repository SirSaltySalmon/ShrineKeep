import { Playfair_Display, Source_Serif_4 } from "next/font/google"

/**
 * True italics for the landing motto. The root layout loads the upright cuts for
 * the theme editor; these variable italic cuts are scoped to `/landing` so other
 * routes do not pay for them.
 */
export const landingPlayfairItalic = Playfair_Display({
  subsets: ["latin"],
  style: "italic",
  variable: "--font-landing-playfair-italic",
})

export const landingSourceSerifItalic = Source_Serif_4({
  subsets: ["latin"],
  style: "italic",
  variable: "--font-landing-source-serif-italic",
})

export const landingFontClasses = `${landingPlayfairItalic.variable} ${landingSourceSerifItalic.variable}`
