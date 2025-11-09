import { createContext } from 'preact'
import type { Context } from 'preact'
import type { AnyRouter } from '@tanstack/router-core'

declare global {
  interface Window {
    __TSR_ROUTER_CONTEXT__?: Context<AnyRouter>
  }
}

const routerContext = createContext<AnyRouter>(null!)

export function getRouterContext() {
  if (typeof document === 'undefined') {
    return routerContext
  }

  if (window.__TSR_ROUTER_CONTEXT__) {
    return window.__TSR_ROUTER_CONTEXT__
  }

  window.__TSR_ROUTER_CONTEXT__ = routerContext as any

  return routerContext
}
