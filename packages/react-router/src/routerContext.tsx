import * as React from 'react'
import type { AnyRouter } from '@tanstack/router-core'

export const routerContext: React.Context<AnyRouter> = React.createContext<AnyRouter>(null!)
