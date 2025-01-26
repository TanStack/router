import * as React from 'react'
import type { AnyRouter, Router } from './router'

declare global {
  interface Window {
    __TSR_ROUTER_CONTEXT__?: React.Context<AnyRouter>
  }
}

const routerContext = React.createContext<Router<any, any, any>>(null!)

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
