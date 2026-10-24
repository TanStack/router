import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'
import { honoSessionApp } from '~/hono-sessions'

function handle({ request }: { request: Request }) {
  setCookie('start-side', 'coexists', { path: '/' })
  return honoSessionApp.fetch(request)
}

export const Route = createFileRoute('/api/session-hono')({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
