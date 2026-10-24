import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { countClientRun } from '~/utils/origin'

// A redirect thrown by an in-place re-run during hydration. This
// beforeLoad is not transported (`dehydrate: false`); its server run passes,
// its client runs (in place during hydration, then in the client load that
// follows) hit a client-only condition and redirect. The child route carries
// a codec loader whose transported wire value must never reach the DOM. The
// two runs produce different outcomes, so the subtree is not server-rendered
// (a server-rendered component needs the same value on both sides).

const mustRedirect = createIsomorphicFn()
  .server(() => false)
  .client(() => true)

export const Route = createFileRoute('/in-place-redirect')({
  ssr: 'data-only',
  beforeLoad: {
    handler: () => {
      countClientRun('ipr-beforeLoad')
      if (mustRedirect()) throw redirect({ to: '/' })
      return { iprGuard: 'passed' }
    },
    dehydrate: false,
  },
  component: () => (
    <div data-testid="ipr-parent">
      <h1 data-testid="ipr-heading">In-place redirect</h1>
      <Outlet />
    </div>
  ),
})
