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
          <h1>Profile</h1>
          <h2>Match</h2>
          <dl>
            <dt>Route id</dt>
            <dd>
              <output data-testid="final-route-id">
                {match.value?.routeId}
              </output>
            </dd>
            <dt>Params</dt>
            <dd>
              <output data-testid="runtime-params">
                {JSON.stringify(match.value?.params)}
              </output>
            </dd>
            <dt>Router href</dt>
            <dd>
              <output data-testid="scoped-href">
                {scopedRouter.buildLocation({ to: '/members' }).href}
              </output>
            </dd>
            <dt>MatchRoute</dt>
            <dd>
              <MatchRoute to="/profile">
                <span>PROFILE_MATCH</span>
              </MatchRoute>
              <MatchRoute to="/members">
                <span>MEMBERS_MATCH</span>
              </MatchRoute>
            </dd>
          </dl>
          <h2>Links</h2>
          <p class="actions">
            <api.Link to="/members">API members</api.Link>
            <a {...anchor.value}>Custom members</a>
            <Route.Link to="/">Route home</Route.Link>
            {/* The framework's own Link keeps application coordinates. */}
            <ApplicationLink to="/orgs/$orgId" params={{ orgId: '7' }}>
              Organization host
            </ApplicationLink>
          </p>
          <h2>Navigation</h2>
          <p class="actions">
            <button onClick={() => navigate({ to: '/members' })}>
              Navigate members
            </button>
            <button onClick={() => scopedRouter.navigate({ to: '/members' })}>
              Router members
            </button>
            <button onClick={() => routeNavigate({ to: '..' })}>
              Route up
            </button>
            <button onClick={() => relativeNavigate({ to: '..' })}>
              Explicit from home
            </button>
          </p>
        </>
      )
    },
  }),
})
