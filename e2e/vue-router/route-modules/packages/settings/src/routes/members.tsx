import * as Vue from 'vue'
import { createFileRoute, getRouteApi } from '../routeScope.gen'
const ProfileLink = getRouteApi('@route-modules/vue-settings:/profile').Link
export const Route = createFileRoute('@route-modules/vue-settings:/members')({
  loader: () => ({ label: 'members' as const }),
  component: () => (
    <>
      <p>MEMBERS_PAGE</p>
      <ProfileLink to="/profile">Profile</ProfileLink>
    </>
  ),
})
