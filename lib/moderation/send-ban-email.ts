import { Resend } from "resend"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error("Missing RESEND_API_KEY")
  }
  return new Resend(key)
}

function displayAppName(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (url) {
    try {
      return new URL(url).hostname || "ShrineKeep"
    } catch {
      return url
    }
  }
  return "ShrineKeep"
}

export async function sendBanEmail(options: {
  to: string
  includeSubscriptionCancelledNotice: boolean
}): Promise<void> {
  const from = process.env.MODERATION_EMAIL_FROM
  if (!from) {
    throw new Error("Missing MODERATION_EMAIL_FROM")
  }

  const appName = displayAppName()
  const subscriptionBlock = options.includeSubscriptionCancelledNotice
    ? "\n\nIf you had an active Pro subscription, it has been cancelled. You will not be charged again for ShrineKeep Pro."
    : ""

  const text = `Your ${appName} account has been banned for a violation of our terms of service.${subscriptionBlock}\n\nThis message was sent automatically; replies may not be monitored.`

  const htmlSubscription = options.includeSubscriptionCancelledNotice
    ? "<p>If you had an active Pro subscription, it has been cancelled. You will not be charged again for ShrineKeep Pro.</p>"
    : ""

  const html = `<p>Your ${escapeHtml(appName)} account has been banned for a violation of our terms of service.</p>${htmlSubscription}<p>This message was sent automatically; replies may not be monitored.</p>`

  const resend = getResendClient()
  const { error } = await resend.emails.send({
    from,
    to: options.to,
    subject: `Account banned — ${appName}`,
    text,
    html,
  })

  if (error) {
    throw new Error(`Resend: ${error.message}`)
  }
}
