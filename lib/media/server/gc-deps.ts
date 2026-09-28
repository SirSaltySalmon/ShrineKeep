import type { GcDependencies } from "./gc-worker"

type StorageClient = {
  rpc(name: string, args: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> }
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: unknown }> } }
}

/** Shared Storage/RPC adapter for the Edge function and the Next cron route. */
export function createMediaGcDependencies(client: StorageClient): GcDependencies {
  return {
    rpc: async (name, args, signal) => {
      if (signal.aborted) throw new Error("deadline")
      return await client.rpc(name, args).abortSignal(signal)
    },
    remove: async (bucket, objectPath, signal) => {
      if (signal.aborted) throw new Error("deadline")
      return await client.storage.from(bucket).remove([objectPath])
    },
  }
}
