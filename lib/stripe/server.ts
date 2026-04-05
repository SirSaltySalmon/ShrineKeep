import Stripe from "stripe"

export const STRIPE_API_VERSION = "2026-03-25.dahlia"

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const stripe = new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
  apiVersion: STRIPE_API_VERSION,
})

export function getStripeWebhookSecret(): string {
  return getRequiredEnv("STRIPE_WEBHOOK_SECRET")
}

export function getStripePriceId(): string {
  return getRequiredEnv("STRIPE_PRICE_ID")
}
