import { Link, createFileRoute } from '../routeScope.gen'

const members = [
  { id: 'ada', role: 'Engineering' },
  { id: 'grace', role: 'Operations' },
]

export const Route = createFileRoute('@route-modules/team:/')({
  component: Members,
})

function Members() {
  return (
    <ul className="rows">
      {members.map((member) => (
        <li key={member.id}>
          <Link to="/members/$memberId" params={{ memberId: member.id }}>
            {member.id}
          </Link>
          <span className="meta">{member.role}</span>
        </li>
      ))}
    </ul>
  )
}
