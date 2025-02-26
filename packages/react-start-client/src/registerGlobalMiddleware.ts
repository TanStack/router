import type { AnyMiddleware } from './createMiddleware'

export const globalMiddleware: Array<AnyMiddleware> = []

export function registerGlobalMiddleware(options: {
  middleware: Array<AnyMiddleware>
}) {
  globalMiddleware.push(...options.middleware)
}
