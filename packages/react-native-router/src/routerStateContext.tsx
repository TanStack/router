import * as React from 'react'
import type { AnyRoute, RouterState } from '@tanstack/router-core'

export const routerStateContext = React.createContext<
  RouterState<AnyRoute> | undefined
>(undefined)
