import type { AnyFunctionMiddleware } from './createMiddleware'

export const globalMiddleware: Array<AnyFunctionMiddleware> = []

export function registerGlobalMiddleware(options: {
  middleware: Array<AnyFunctionMiddleware>
}) {
  globalMiddleware.push(...options.middleware)
}
