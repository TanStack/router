import * as React from 'react'
import { createFileRoute, getRouteApi } from '../routeScope.gen'
const ProfileLink = getRouteApi('@route-modules/settings:/profile').Link
export const Route = createFileRoute('@route-modules/settings:/members')({
  loader: () => ({ label: 'members' as const }),
  component: () => (
    <>
      <p>MEMBERS_PAGE</p>
      <ProfileLink to="/profile">Profile</ProfileLink>
    </>
  ),
})
