import { createFileRoute, getRouteApi } from '../routeScope.gen'
const ProfileLink = getRouteApi('@route-modules/solid-settings:/profile').Link
export const Route = createFileRoute('@route-modules/solid-settings:/members')({
  loader: () => ({ label: 'members' as const }),
  component: () => (
    <>
      <p>MEMBERS_PAGE</p>
      <ProfileLink to="/profile">Profile</ProfileLink>
    </>
  ),
})
