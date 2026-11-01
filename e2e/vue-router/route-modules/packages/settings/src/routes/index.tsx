import { createFileRoute, Link } from '../routeScope.gen'
export const Route = createFileRoute('@route-modules/vue-settings:/')({
  component: () => <Link to="/profile">Profile</Link>,
})
