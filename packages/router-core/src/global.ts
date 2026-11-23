import type { AnyRouter } from './router'

declare global {
  interface Window {
    __TSR_ROUTER__?: AnyRouter
    /** Development only: every router created on the page (route HMR). */
    __TSR_ROUTERS__?: Array<WeakRef<AnyRouter>>
  }
}

export {}
