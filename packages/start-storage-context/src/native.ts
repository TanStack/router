import type { StartStorageContext } from './async-local-storage'

export type {
  StartStorageContext,
  StartHandlerType,
} from './async-local-storage'

// Resolved through the `react-native` export condition. A native client never
// handles a Start request, and its runtime has no `node:async_hooks`.
let currentContext: StartStorageContext | undefined

export async function runWithStartContext<T>(
  context: StartStorageContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = currentContext
  currentContext = context
  try {
    return await fn()
  } finally {
    currentContext = previous
  }
}

export function getStartContext<TThrow extends boolean = true>(opts?: {
  throwIfNotFound?: TThrow
}): TThrow extends false
  ? StartStorageContext | undefined
  : StartStorageContext {
  if (!currentContext && opts?.throwIfNotFound !== false) {
    throw new Error(
      `No Start context found. Start request context only exists in the server runtime.`,
    )
  }
  return currentContext as any
}
