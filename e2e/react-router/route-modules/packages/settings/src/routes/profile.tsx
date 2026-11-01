import * as React from 'react'
import { Link as ApplicationLink } from '@tanstack/react-router'
import {
  createFileRoute,
  getRouteApi,
  MatchRoute,
  useLinkProps,
  useRouter,
  useNavigate,
} from '../routeScope.gen'

const api = getRouteApi('@route-modules/settings:/profile')

export const Route = createFileRoute('@route-modules/settings:/profile')({
  // Each installation loads the profile of the owner its host provides.
  loader: ({ context }) => ({
    kind: context.owner.kind,
    handle: `@${context.owner.id}`,
  }),
  component: Profile,
})

function Profile() {
  const profile = Route.useLoaderData()
  const ProfileLinks = Route.useRouteContext().profileLinks
  const navigate = api.useNavigate()
  const anchor = useLinkProps({ to: '/members' })
  const match = Route.useMatch({ shouldThrow: false })
  const routeNavigate = Route.useNavigate()
  const relativeNavigate = useNavigate({ from: '/profile' })
  const scopedRouter = useRouter()
  const observe = scopedRouter.options.context?.onProfileMatch
  React.useEffect(() => {
    observe?.(match?.routeId)
  }, [observe, match?.routeId])
  return (
    <article>
      <h3>Profile</h3>
      <output data-testid="final-route-id">{match?.routeId}</output>
      <output data-testid="local-route-id">{match?.localRouteId}</output>
      <output data-testid="runtime-params">
        {JSON.stringify(match?.params)}
      </output>
      <api.Link to="/members">API members</api.Link>
      {ProfileLinks ? <ProfileLinks /> : null}
      <button onClick={() => navigate({ to: '/members' })}>
        Navigate members
      </button>
      <a {...anchor}>Custom members</a>
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
      <dl className="facts">
        <dt>Kind</dt>
        <dd data-testid="profile-kind">{profile.kind}</dd>
        <dt>Handle</dt>
        <dd>
          <code>{profile.handle}</code>
        </dd>
      </dl>
      <Route.Link to="/">All settings</Route.Link>
    </article>
  )
}
