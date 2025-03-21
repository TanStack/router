import { TanStackRouterDevtools as DevToolsComponent } from './TanStackRouterDevtools'
import { TanStackRouterDevtoolsPanel as DevToolsPanelComponent } from './TanStackRouterDevtoolsPanel'
import { defineComponent, h } from 'vue'

// Create a null component for production
const NullDevToolsComponent = defineComponent({
  name: 'NullTanStackRouterDevtools',
  setup() {
    return () => null
  }
})

// Create a null panel component for production
const NullDevToolsPanelComponent = defineComponent({
  name: 'NullTanStackRouterDevtoolsPanel',
  setup() {
    return () => null
  }
})

// Export conditionally based on NODE_ENV
export const TanStackRouterDevtools = 
  process.env.NODE_ENV === 'development'
    ? DevToolsComponent
    : NullDevToolsComponent

// Always export the real component
export const TanStackRouterDevtoolsInProd = DevToolsComponent

// Re-export interfaces
export type { DevtoolsOptions } from './TanStackRouterDevtools'
export type { DevtoolsPanelOptions } from './TanStackRouterDevtoolsPanel'

export const TanStackRouterDevtoolsPanel =
  process.env.NODE_ENV === 'development'
    ? DevToolsPanelComponent
    : NullDevToolsPanelComponent

export const TanStackRouterDevtoolsPanelInProd = DevToolsPanelComponent
