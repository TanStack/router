import { createRootRouteWithContext } from '@tanstack/react-router'
import { fromWire } from './client-only'
export const Route = createRootRouteWithContext<{ auth: unknown }>()({
  context: {
    handler: ({ context }) => ({ auth: context.auth }),
    hydrate: ({ data }) => fromWire(data),
    revalidate: ({ prev }) => prev,
  },
  component: () => <div className="p-2">root</div>,
})
