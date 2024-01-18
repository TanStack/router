import * as React from 'react'
import { Router } from './router'

export let routerContext = React.createContext<Router<any>>(null!)
if (typeof document !== 'undefined') {
  if (window.__TSR_ROUTER_CONTEXT__) {
    routerContext = window.__TSR_ROUTER_CONTEXT__
  } else {
    window.__TSR_ROUTER_CONTEXT__ = routerContext as any
  }
}
