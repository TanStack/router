import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'
import { communitySessionApp } from '~/hono-sessions'

function handle({ request }: { request: Request }) {
  setCookie('start-side', 'coexists', { path: '/' })
  return communitySessionApp.fetch(request)
}

export const Route = createFileRoute('/api/session-hono-community')({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
