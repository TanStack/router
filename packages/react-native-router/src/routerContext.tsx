import * as React from 'react'
import type { AnyRouter } from '@tanstack/router-core'

// React Native doesn't have window, so we use a simple context
const routerContext = React.createContext<AnyRouter>(null!)

export function getRouterContext() {
  return routerContext
}
