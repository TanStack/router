import { Outlet, createRoute } from '@tanstack/react-router'
import { stateRoute } from './state'

function SectionLayout() {
  return <Outlet />
}

export const sectionRoute = createRoute({
  getParentRoute: () => stateRoute,
  path: '$section',
  component: SectionLayout,
})
