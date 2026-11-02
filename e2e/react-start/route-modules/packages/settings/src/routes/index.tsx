import { Link, createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@start-route-modules/settings:/')({
  component: SettingsIndex,
})

function SettingsIndex() {
  return (
    <ul className="rows">
      <li>
        <Link to="/profile">Profile</Link>
      </li>
    </ul>
  )
}
