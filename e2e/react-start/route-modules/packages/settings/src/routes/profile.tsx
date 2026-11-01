import { createFileRoute } from '../routeScope.gen'
import { getProfile } from '../api'

export const Route = createFileRoute('@start-route-modules/settings:/profile')({
  // Each installation loads the profile of the owner its host provides.
  loader: ({ context }) =>
    getProfile({ data: { kind: context.owner.kind, id: context.owner.id } }),
  component: Profile,
})

function Profile() {
  const profile = Route.useLoaderData()
  return (
    <article>
      <h3>Profile</h3>
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
