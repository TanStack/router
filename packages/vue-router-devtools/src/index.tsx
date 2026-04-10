import { defineComponent } from 'vue'
import * as Devtools from './TanStackRouterDevtools'
import * as DevtoolsPanel from './TanStackRouterDevtoolsPanel'

// Re-export types
export type { TanStackRouterDevtoolsOptions } from './TanStackRouterDevtools'
export type { TanStackRouterDevtoolsPanelOptions } from './TanStackRouterDevtoolsPanel'

// Create a null component for production
const NullComponent = /* #__PURE__ */ defineComponent({
  name: 'NullTanStackRouterDevtools',
  setup(): () => null {
    return () => null
  },
})

export const TanStackRouterDevtools: (typeof Devtools)['TanStackRouterDevtools'] =
  process.env.NODE_ENV !== 'development'
    ? (NullComponent as (typeof Devtools)['TanStackRouterDevtools'])
    : Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsInProd: (typeof Devtools)['TanStackRouterDevtools'] =
  Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsPanel: (typeof DevtoolsPanel)['TanStackRouterDevtoolsPanel'] =
  process.env.NODE_ENV !== 'development'
    ? (NullComponent as (typeof DevtoolsPanel)['TanStackRouterDevtoolsPanel'])
    : DevtoolsPanel.TanStackRouterDevtoolsPanel

export const TanStackRouterDevtoolsPanelInProd: (typeof DevtoolsPanel)['TanStackRouterDevtoolsPanel'] =
  DevtoolsPanel.TanStackRouterDevtoolsPanel
