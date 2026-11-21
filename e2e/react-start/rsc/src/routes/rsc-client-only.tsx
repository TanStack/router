import type * as React from 'react'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  CompositeComponent,
  createCompositeComponent,
  renderServerComponent,
} from '@tanstack/react-start/rsc'
import { ClientOnlyCounter } from '~/utils/ClientOnlyCounter'

// ============================================================================
// <ClientOnly> IN SERVER COMPONENTS: the server renders the fallback, the
// browser the children after hydration. The children travel in the Flight
// payload: JSX a handler renders and a composite component's slot alike.
// ============================================================================

const getPanel = createServerFn({ method: 'GET' }).handler(async () =>
  renderServerComponent(
    <div data-testid="rsc-client-only-panel">
      <span>server panel</span>
      <ClientOnly
        fallback={
          <i data-testid="rsc-client-only-panel-fallback">panel fallback</i>
        }
      >
        <ClientOnlyCounter label="panel" />
      </ClientOnly>
    </div>,
  ),
)

const getComposite = createServerFn({ method: 'GET' }).handler(async () =>
  createCompositeComponent((props: { children?: React.ReactNode }) => (
    <div data-testid="rsc-client-only-composite">
      <span>server composite</span>
      <ClientOnly
        fallback={
          <i data-testid="rsc-client-only-composite-fallback">
            composite fallback
          </i>
        }
      >
        <ClientOnlyCounter label="composite" />
        {props.children}
      </ClientOnly>
    </div>
  )),
)

export const Route = createFileRoute('/rsc-client-only')({
  loader: async () => ({
    panel: await getPanel(),
    composite: await getComposite(),
  }),
  component: RscClientOnlyComponent,
})

function RscClientOnlyComponent() {
  const { panel, composite } = Route.useLoaderData()
  return (
    <div data-testid="rsc-client-only-page">
      {panel}
      <CompositeComponent src={composite}>
        <b data-testid="rsc-client-only-slot">slot content</b>
      </CompositeComponent>
    </div>
  )
}
