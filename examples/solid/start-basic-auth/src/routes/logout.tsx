import { createFileRoute, redirect } from '@tanstack/solid-router'
import { createServerFn } from '@tanstack/solid-start'
import { getAppSession } from '~/utils/session'

const logoutFn = createServerFn().handler(async () => {
  const session = await getAppSession()
  session.destroy()

  throw redirect({
    href: '/',
  })
})

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => logoutFn(),
})
