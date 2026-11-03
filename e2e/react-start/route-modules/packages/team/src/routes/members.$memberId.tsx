import { Link, createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute(
  '@start-route-modules/team:/members/$memberId',
)({
  component: Member,
})

function Member() {
  const { memberId } = Route.useParams()
  const { org } = Route.useRouteContext()
  return (
    <article>
      <h3>{`${memberId} at ${org.name}`}</h3>
      <dl className="facts">
        <dt>Organization</dt>
        <dd>
          <code>{org.id}</code>
        </dd>
        <dt>Member</dt>
        <dd>
          <code>{memberId}</code>
        </dd>
      </dl>
      <Link to="/">All members</Link>
    </article>
  )
}
