import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useAppSession } from '~/utils/session'

const logoutFn = createServerFn().handler(async () => {
  const session = await useAppSession()

  session.clear()

  throw redirect({
    href: '/',
  })
})

export const Route = createFileRoute({
  preload: false,
  loader: () => logoutFn(),
})
