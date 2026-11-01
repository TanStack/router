import * as Vue from 'vue'
import { createRootRouteWithContext, Outlet } from '@tanstack/vue-router'
import { orgSettings, userSettings } from '../routeScope.gen'
export const Route = createRootRouteWithContext<{
  onProfileMatch?: (routeId: string | undefined) => void
}>()({
  component: Vue.defineComponent({
    setup() {
      const organizationProfile = orgSettings.useMatch({
        from: '@route-modules/vue-settings:/profile',
        shouldThrow: false,
      })
      return () => (
        <>
          <nav aria-label="Installations">
            <orgSettings.Link to="/profile" params={{ orgId: '7' }}>
              Switch to organization
            </orgSettings.Link>
            <userSettings.Link to="/profile" params={{ userId: 'u1' }}>
              Switch to person
            </userSettings.Link>
            <output data-testid="organization-profile">
              {organizationProfile.value?.routeId ?? 'none'}
            </output>
          </nav>
          <Outlet />
        </>
      )
    },
  }),
  notFoundComponent: () => <p>APP_NOT_FOUND</p>,
})
