import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { countClientRun, getOrigin } from '~/utils/origin'

// Cached auth context.
// The session lookup runs once per match on the server, is transported
// (`dehydrate: true`), is restored at hydration without running again, and is
// refreshed only by `router.invalidate()` (`revalidate: true`). The beforeLoad
// guard redirects when there is no session.

async function getSession(user: string) {
  await new Promise((resolve) => setTimeout(resolve, 5))
  if (user === 'nobody') return null
  return { user, origin: getOrigin() }
}

export const Route = createFileRoute('/cached-auth/$user')({
  context: {
    handler: async ({ params }) => ({
      session: await getSession(params.user),
      // 0 when the value was produced on the server; n after the n-th client run.
      clientRuns: countClientRun('auth-context'),
    }),
    dehydrate: true,
    revalidate: true,
  },
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/' })
    return { guard: `guarded-${context.session.user}` }
  },
  loader: ({ context }) => ({
    loaderOrigin: getOrigin(),
    loaderUser: context.session?.user ?? 'none',
  }),
  component: CachedAuthComponent,
})

function CachedAuthComponent() {
  const router = useRouter()
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  return (
    <div data-testid="auth-component">
      <h1 data-testid="auth-heading">Cached auth context</h1>
      <div data-testid="auth-session-user">
        {context.session?.user ?? 'none'}
      </div>
      <div data-testid="auth-session-origin">
        {context.session?.origin ?? 'none'}
      </div>
      <div data-testid="auth-client-runs">{String(context.clientRuns)}</div>
      <div data-testid="auth-guard">{context.guard}</div>
      <div data-testid="auth-loader-origin">{loaderData.loaderOrigin}</div>
      <div data-testid="auth-loader-user">{loaderData.loaderUser}</div>
      <button
        data-testid="auth-invalidate-btn"
        onClick={() => router.invalidate()}
      >
        Invalidate
      </button>
    </div>
  )
}
