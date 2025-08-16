import { AsyncLocalStorage } from 'node:async_hooks'
import type { AnyRouter } from '@tanstack/router-core'

export interface StartStorageContext {
  router: AnyRouter
  middlewares?: {
    // TODO fix circular depedency by moving types to a separate package?
    request?: Array</*AnyRequestMiddleware*/ any>
    // TODO fix circular depedency by moving types to a separate package?
    function?: Array</*AnyFunctionMiddleware*/ any>
  }
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
