import * as Vue from 'vue'
import { Link as ApplicationLink } from '@tanstack/vue-router'
import {
  createFileRoute,
  getRouteApi,
  MatchRoute,
  useLinkProps,
  useNavigate,
  useRouter,
} from '../routeScope.gen'
const api = getRouteApi('@route-modules/vue-settings:/profile')
export const Route = createFileRoute('@route-modules/vue-settings:/profile')({
  component: Vue.defineComponent({
    setup() {
      const navigate = api.useNavigate()
      const routeNavigate = Route.useNavigate()
      const relativeNavigate = useNavigate({ from: '/profile' })
      const anchor = useLinkProps({ to: '/members' })
      const match = Route.useMatch({ shouldThrow: false })
      const scopedRouter = useRouter()
      const observe = scopedRouter.options.context?.onProfileMatch
      Vue.watchEffect(() => observe?.(match.value?.routeId), { flush: 'sync' })
      return () => (
        <>
          <output data-testid="final-route-id">{match.value?.routeId}</output>
          <output data-testid="runtime-params">
            {JSON.stringify(match.value?.params)}
          </output>
          <api.Link to="/members">API members</api.Link>
          <button onClick={() => navigate({ to: '/members' })}>
            Navigate members
          </button>
          <a {...anchor.value}>Custom members</a>
          <MatchRoute to="/profile">
            <span>PROFILE_MATCH</span>
          </MatchRoute>
          <MatchRoute to="/members">
            <span>MEMBERS_MATCH</span>
          </MatchRoute>
          <output data-testid="scoped-href">
            {scopedRouter.buildLocation({ to: '/members' }).href}
          </output>
          <button onClick={() => scopedRouter.navigate({ to: '/members' })}>
            Router members
          </button>
          <button onClick={() => routeNavigate({ to: '..' })}>Route up</button>
          <button onClick={() => relativeNavigate({ to: '..' })}>
            Explicit from home
          </button>
          <Route.Link to="/">Route home</Route.Link>
          <ApplicationLink to="/orgs/$orgId" params={{ orgId: '9' }}>
            Application host
          </ApplicationLink>
        </>
      )
    },
  }),
})
