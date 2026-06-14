import { Outlet, createRootRoute } from '@tanstack/react-router'
import { ROOT_ERROR_MARKER, UNMATCHED_MARKER } from '../../../shared'
import { ControlFlowMarker } from '../control-flow'

export const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: RootNotFoundComponent,
  errorComponent: RootErrorComponent,
})

function Root() {
  return <Outlet />
}

function RootNotFoundComponent() {
  return <ControlFlowMarker {...UNMATCHED_MARKER} />
}

function RootErrorComponent() {
  return <ControlFlowMarker {...ROOT_ERROR_MARKER} />
}
