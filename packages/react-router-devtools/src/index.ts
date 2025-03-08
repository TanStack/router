import { TanStackRouterDevtools as NotPanel } from './TanStackRouterDevtools'
import { TanStackRouterDevtoolsPanel as Panel } from './TanStackRouterDevtoolsPanel'

export const TanStackRouterDevtools: typeof NotPanel =
  process.env.NODE_ENV !== 'development'
    ? function () {
        return null
      }
    : NotPanel

export const TanStackRouterDevtoolsInProd: typeof NotPanel = NotPanel

export const TanStackRouterDevtoolsPanel: typeof Panel =
  process.env.NODE_ENV !== 'development'
    ? function () {
        return null
      }
    : Panel

export const TanStackRouterDevtoolsPanelInProd: typeof Panel = Panel
