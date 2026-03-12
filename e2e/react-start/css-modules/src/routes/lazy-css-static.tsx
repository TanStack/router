import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { SharedWidget } from '~/components/shared-widget'

export const Route = createFileRoute('/lazy-css-static')({
  component: LazyCssStaticRoute,
})

function LazyCssStaticRoute() {
  return (
    <div>
      <h1>Lazy CSS Repro - Static Route</h1>
      <p>
        This route statically imports the shared widget so its CSS is present in
        the SSR head.
      </p>

      <ClientOnly>
        <div data-testid="lazy-css-static-hydrated">hydrated</div>
      </ClientOnly>

      <SharedWidget />
    </div>
  )
}
