import * as Solid from 'solid-js'
import type { AnyRouter, Router } from './router'

declare global {
  interface Window {
    __TSR_ROUTER_CONTEXT__?: Solid.Context<AnyRouter>
  }
}

const routerContext = Solid.createContext<Router<any, any, any>>(
  null as unknown as Router<any, any, any>,
)


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