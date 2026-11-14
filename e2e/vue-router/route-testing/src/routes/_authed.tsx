import { defineComponent } from 'vue'
import { Outlet, createFileRoute, redirect } from '@tanstack/vue-router'
import { fetchUnreadCount } from '../api'
import { UserMenu } from '../components/UserMenu'

const AuthedLayout = defineComponent({
  setup() {
    return () => (
      <>
        <UserMenu />
        <Outlet />
      </>
    )
  },
})

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
