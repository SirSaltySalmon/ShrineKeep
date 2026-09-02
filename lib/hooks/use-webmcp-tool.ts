"use client"

import { useEffect, useRef, useState } from "react"

interface WebMcpToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

interface WebMcpExecutionOptions {
  signal?: AbortSignal
}

interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: WebMcpToolAnnotations
  execute: (input: Record<string, unknown>, options?: WebMcpExecutionOptions) => unknown | Promise<unknown>
}

interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal }
  ) => Promise<void>
}

export type WebMcpToolStatus =
  | "checking"
  | "unsupported"
  | "registering"
  | "ready"
  | "error"
  | "disabled"

export interface WebMcpVisibleTool {
  name: string
  title: string
  description: string
  readOnly: boolean
}

export interface WebMcpActivityItem {
  id: string
  toolName: string
  toolTitle: string
  startedAt: string
  completedAt: string | null
  status: "running" | "succeeded" | "failed"
  error?: string
}

export interface WebMcpToolState {
  status: WebMcpToolStatus
  tool: WebMcpVisibleTool
  activity: WebMcpActivityItem[]
  invocationCount: number
  lastInvokedAt: string | null
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext
  }
}

function stableToolSignature(tool: WebMcpToolDefinition): string {
  return JSON.stringify({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  })
}

/**
 * Register a native WebMCP tool for the lifetime of the calling component.
 * Unsupported browsers degrade to a no-op. A short delayed retry covers
 * extensions that inject document.modelContext just after React mounts.
 */
export function useWebMcpTool(
  tool: WebMcpToolDefinition,
  enabled = true,
  onStart?: (name: string) => void
): WebMcpToolState {
  const executeRef = useRef(tool.execute)
  executeRef.current = tool.execute
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  const signature = stableToolSignature(tool)
  const [status, setStatus] = useState<WebMcpToolStatus>(enabled ? "checking" : "disabled")
  const [invocationCount, setInvocationCount] = useState(0)
  const [lastInvokedAt, setLastInvokedAt] = useState<string | null>(null)
  const [activity, setActivity] = useState<WebMcpActivityItem[]>([])

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setStatus("disabled")
      return
    }

    const controller = new AbortController()
    let registered = false
    let retryId: ReturnType<typeof setTimeout> | null = null
    setStatus("checking")

    const register = () => {
      if (registered || controller.signal.aborted || !document.modelContext) return false
      registered = true
      setStatus("registering")
      const stableTool: WebMcpToolDefinition = {
        ...tool,
        execute: async (input, options) => {
          const activityId = crypto.randomUUID()
          const startedAt = new Date().toISOString()
          if (!controller.signal.aborted) {
            const nextActivity: WebMcpActivityItem = {
              id: activityId,
              toolName: tool.name,
              toolTitle: tool.title ?? tool.name,
              startedAt,
              completedAt: null,
              status: "running",
            }
            setInvocationCount((count) => count + 1)
            setLastInvokedAt(startedAt)
            setActivity((items) => [nextActivity, ...items].slice(0, 20))
            onStartRef.current?.(tool.name)
          }
          try {
            const result = await executeRef.current(input, options)
            if (!controller.signal.aborted) {
              setActivity((items) => items.map((item) => item.id === activityId
                ? { ...item, completedAt: new Date().toISOString(), status: "succeeded" }
                : item))
            }
            return result
          } catch (cause: unknown) {
            if (!controller.signal.aborted) {
              const message = cause instanceof Error ? cause.message : "The action could not be completed"
              setActivity((items) => items.map((item) => item.id === activityId
                ? {
                    ...item,
                    completedAt: new Date().toISOString(),
                    status: "failed",
                    error: message.slice(0, 180),
                  }
                : item))
            }
            throw cause
          }
        },
      }
      void document.modelContext
        .registerTool(stableTool, { signal: controller.signal })
        .then(() => {
          if (!controller.signal.aborted) setStatus("ready")
        })
        .catch((error) => {
          registered = false
          if (!controller.signal.aborted) {
            setStatus("error")
            console.warn(`[WebMCP] Failed to register ${tool.name}:`, error)
          }
        })
      return true
    }

    if (!register()) {
      retryId = setTimeout(() => {
        if (!register() && !controller.signal.aborted) setStatus("unsupported")
      }, 1_000)
    }

    return () => {
      if (retryId) clearTimeout(retryId)
      controller.abort()
    }
    // The serialized definition controls registration. execute is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature])

  return {
    status,
    tool: {
      name: tool.name,
      title: tool.title ?? tool.name,
      description: tool.description,
      readOnly: tool.annotations?.readOnlyHint === true,
    },
    activity,
    invocationCount,
    lastInvokedAt,
  }
}
