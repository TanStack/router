import { Component } from '@angular/core'
import * as Devtools from './tanstack-router-devtools'
import * as DevtoolsPanel from './tanstack-router-devtools-panel'

// No-op component for production
@Component({
  selector: 'router-devtools',
  template: '',
  standalone: true,
})
class NoOpTanStackRouterDevtools {}

@Component({
  selector: 'router-devtools-panel',
  template: '',
  standalone: true,
})
class NoOpTanStackRouterDevtoolsPanel {}

export const TanStackRouterDevtools: typeof Devtools.TanStackRouterDevtools =
  process.env.NODE_ENV !== 'development'
    ? (NoOpTanStackRouterDevtools as any)
    : Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsInProd: typeof Devtools.TanStackRouterDevtools =
  Devtools.TanStackRouterDevtools

export const TanStackRouterDevtoolsPanel: typeof DevtoolsPanel.TanStackRouterDevtoolsPanel =
  process.env.NODE_ENV !== 'development'
    ? (NoOpTanStackRouterDevtoolsPanel as any)
    : DevtoolsPanel.TanStackRouterDevtoolsPanel

export const TanStackRouterDevtoolsPanelInProd: typeof DevtoolsPanel.TanStackRouterDevtoolsPanel =
  DevtoolsPanel.TanStackRouterDevtoolsPanel

export type { TanStackRouterDevtoolsOptions } from './tanstack-router-devtools'
export type { TanStackRouterDevtoolsPanelOptions } from './tanstack-router-devtools-panel'
