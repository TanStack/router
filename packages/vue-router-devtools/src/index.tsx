import { TanStackRouterDevtools as DevToolsComponent } from './TanStackRouterDevtools'
import { defineComponent, h } from 'vue'
// import * as DevtoolsPanel from './TanStackRouterDevtoolsPanel'

// Create a null component for production
const NullDevToolsComponent = defineComponent({
  name: 'NullTanStackRouterDevtools',
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

// export const TanStackRouterDevtoolsPanel: (typeof DevtoolsPanel)['TanStackRouterDevtoolsPanel'] =
//   process.env.NODE_ENV !== 'development'
//     ? function () {
//         return null
//       }
//     : DevtoolsPanel.TanStackRouterDevtoolsPanel

// export const TanStackRouterDevtoolsPanelInProd: (typeof DevtoolsPanel)['TanStackRouterDevtoolsPanel'] =
//   DevtoolsPanel.TanStackRouterDevtoolsPanel
