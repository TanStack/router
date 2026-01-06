import * as Angular from '@angular/core'
import type { AnyRouter } from '@tanstack/router-core'

declare global {
  interface Window {
    __TSR_ROUTER_INJECTION_KEY__?: Angular.InjectionToken<AnyRouter>
  }
}

const routerInjectionKey = new Angular.InjectionToken<AnyRouter>('ROUTER')

export function getRouterInjectionKey() {
  if (typeof document === 'undefined') {
    return routerInjectionKey
  }

  if (window.__TSR_ROUTER_INJECTION_KEY__) {
    return window.__TSR_ROUTER_INJECTION_KEY__
  }

  window.__TSR_ROUTER_INJECTION_KEY__ = routerInjectionKey as any

  return routerInjectionKey
}
