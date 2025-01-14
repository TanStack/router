import * as Solid from 'solid-js'
import type { Router } from './router'

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
