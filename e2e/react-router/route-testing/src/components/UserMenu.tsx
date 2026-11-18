import { Link, getRouteApi } from '@tanstack/react-router'

const authedRoute = getRouteApi('/_authed')

export function UserMenu() {
  const { user } = authedRoute.useRouteContext()
  const { unreadCount } = authedRoute.useLoaderData()

  return (
    <div aria-label="User menu">
      <span>{user.name}</span>
      <span>{unreadCount} unread</span>
      <Link to="/login">Sign out</Link>
    </div>
  )
}
