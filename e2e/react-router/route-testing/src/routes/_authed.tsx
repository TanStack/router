import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { fetchUnreadCount } from '../api'
import { UserMenu } from '../components/UserMenu'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.session.user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user: context.session.user }
  },
  loader: async () => ({ unreadCount: await fetchUnreadCount() }),
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <>
      <UserMenu />
      <Outlet />
    </>
  )
}
