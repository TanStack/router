import * as Vue from 'vue'
import { Outlet } from '@tanstack/vue-router'
import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot<{
  onProfileMatch?: (routeId: string | undefined) => void
}>()({
  component: () => <Outlet />,
  notFoundComponent: () => <p>MODULE_NOT_FOUND</p>,
})
