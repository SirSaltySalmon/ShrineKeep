import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Clone/dev wakeup: Vercel cron does not run against db-clones. Production uses vercel.json.
    if (!process.env.VERCEL) {
      const secret = process.env.CRON_SECRET ?? process.env.MEDIA_GC_WORKER_SECRET
      if (secret && secret.length >= 32) {
        const origin = "http://127.0.0.1:3000"
        setInterval(() => {
          void fetch(`${origin.replace(/\/$/, "")}/api/media/gc`, {
            method: "GET",
            headers: { Authorization: `Bearer ${secret}` },
          }).catch(() => undefined)
        }, 60_000)
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
