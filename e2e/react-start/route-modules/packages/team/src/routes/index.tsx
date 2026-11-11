import { Link, createFileRoute, settings } from '../routeScope.gen'
import { listMembers } from '../api'

export const Route = createFileRoute('@start-route-modules/team:/')({
  loader: ({ context }) => listMembers({ data: context.org.id }),
  component: Members,
})

function Members() {
  const members = Route.useLoaderData()
  return (
    <>
      <ul className="rows">
        {members.map((member) => (
          <li key={member.id}>
            <Link to="/members/$memberId" params={{ memberId: member.id }}>
              {member.label}
            </Link>
          </li>
        ))}
      </ul>
      {/* The settings are installed for organizations and for people: the
          team links to the installation of its own organization. */}
      <settings.Link to="/profile">Organization profile</settings.Link>
    </>
  )
}
