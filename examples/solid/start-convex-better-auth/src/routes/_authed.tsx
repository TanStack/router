import { Outlet, createFileRoute, redirect } from '@tanstack/solid-router'
import { fetchUser } from '~/lib/server'

export const Route = createFileRoute('/_authed')({
  component: () => (
    <>
      <Outlet />
    </>
  ),
  beforeLoad: async (ctx) => {
    const user = await fetchUser()
    if (!ctx.context.token || !ctx.context.session || !user) {
      const currentPath = ctx.location.pathname + ctx.location.search
      throw redirect({
        to: '/',
        search: { redirect: currentPath },
      })
    }
    return { user }
  },
})
