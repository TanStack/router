import type { AnyMiddleware } from './createMiddleware'

export interface Register {
  // globalMiddleware: Array<AnyMiddleware>
}

export type RegisteredGlobalMiddleware = Register extends {
  globalMiddleware: infer TGlobalMiddleware extends {
    middleware: Array<AnyMiddleware>
  }
}
  ? TGlobalMiddleware['middleware']
  : Array<AnyMiddleware>

export type GlobalMiddleware<TMiddleware extends Array<AnyMiddleware>> = {
  middleware: TMiddleware
}

export const globalMiddleware: RegisteredGlobalMiddleware = []

export function registerGlobalMiddleware<
  const TMiddleware extends Array<AnyMiddleware>,
>(options: { middleware: TMiddleware }): GlobalMiddleware<TMiddleware> {
  globalMiddleware.push(...options.middleware)
  return {
    middleware: options.middleware,
  }
}
