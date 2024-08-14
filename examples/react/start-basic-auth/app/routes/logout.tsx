import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/start'
import { useEffect } from 'react'
import { sessionStorage } from '~/utils/session'

const logout = createServerFn('POST', async (_: void, { request }) => {
  const session = await sessionStorage.getSession(request.headers.get('cookie'))

  throw redirect({
    href: '/',
    headers: {
      'Set-Cookie': await sessionStorage.destroySession(session),
    },
  })
})

export const Route = createFileRoute('/logout')({
  component: () => {
    useEffect(() => {
      useServerFn(logout)()
    }, [])
  },
})
