import type { AnyFunctionMiddleware } from './createMiddleware'

declare global {
  interface Window {
    __TSS_GLOBAL_MIDDLEWARES__?: Array<AnyFunctionMiddleware>
  }
}

export {}
