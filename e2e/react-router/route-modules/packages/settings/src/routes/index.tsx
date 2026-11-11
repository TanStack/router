import { Link, createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/settings:/')({
  component: SettingsIndex,
})

function SettingsIndex() {
  return (
    <ul className="rows">
      <li>
        <Link to="/profile">Profile</Link>
        <span className="meta">Name and contact</span>
      </li>
    </ul>
  )
}
