import * as Sentry from "@sentry/nextjs"

type PrimitiveTag = string | number | boolean

interface RouteCaptureContext {
  area: string
  route: string
  userId?: string | null
  tags?: Record<string, PrimitiveTag | null | undefined>
  extra?: Record<string, unknown>
}

function withRouteScope<T>(
  context: RouteCaptureContext,
  callback: () => T
): T {
  return Sentry.withScope((scope) => {
    scope.setTag("area", context.area)
    scope.setTag("route", context.route)
    if (context.userId) {
      scope.setUser({ id: context.userId })
    }
    for (const [key, value] of Object.entries(context.tags ?? {})) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, value)
      }
    }
    for (const [key, value] of Object.entries(context.extra ?? {})) {
      if (value !== undefined) {
        scope.setExtra(key, value)
      }
    }
    return callback()
  })
}

export function captureRouteException(
  error: unknown,
  context: RouteCaptureContext
): void {
  withRouteScope(context, () => {
    Sentry.captureException(error)
  })
}

export function captureRouteMessage(
  message: string,
  context: RouteCaptureContext,
  level: Sentry.SeverityLevel = "warning"
): void {
  withRouteScope(context, () => {
    Sentry.captureMessage(message, level)
  })
}

export async function startRouteSpan<T>(
  name: string,
  op: string,
  attributes: Record<string, PrimitiveTag | undefined>,
  callback: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan(
    {
      name,
      op,
      attributes,
    },
    callback
  )
}
