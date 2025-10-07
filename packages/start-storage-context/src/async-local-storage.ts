import { AsyncLocalStorage } from 'node:async_hooks'
import type { Awaitable, RegisteredRouter } from '@tanstack/router-core'

export interface StartStorageContext {
  getRouter: () => Awaitable<RegisteredRouter>
  request: Request
  // TODO type this properly
  startOptions: /* AnyStartInstanceOptions*/ any

  contextAfterGlobalMiddlewares: any
}

const startStorage = new AsyncLocalStorage<StartStorageContext>()

export async function runWithStartContext<T>(
  context: StartStorageContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return startStorage.run(context, fn)
}

export function getStartContext<TThrow extends boolean = true>(opts?: {
  throwIfNotFound?: TThrow
}): TThrow extends false
  ? StartStorageContext | undefined
  : StartStorageContext {
  const context = startStorage.getStore()
  if (!context && opts?.throwIfNotFound !== false) {
    throw new Error(
      `No Start context found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`,
    )
  }
  return context as any
}
