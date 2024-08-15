import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { sessionStorage } from '~/utils/session'

const logoutFn = createServerFn('POST', async (_: void, { request }) => {
  const session = await sessionStorage.getSession(request.headers.get('cookie'))

  throw redirect({
    href: '/',
    headers: {
      'Set-Cookie': await sessionStorage.destroySession(session),
    },
  })
})

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => logoutFn(),
})
