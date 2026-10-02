'use client'

import * as React from 'react'
import type {
  AnyRouter,
  ParsedLocation,
  RouterReadableStore,
} from '@tanstack/router-core'

export type RouterContextValue = readonly [
  router: AnyRouter,
  location?: RouterReadableStore<ParsedLocation>,
  routeId?: string,
]

export const routerContext = React.createContext<RouterContextValue>(null!)
