import { createRootRouteWithContext } from '@tanstack/react-router'
import { toWire } from './server-only'
export const Route = createRootRouteWithContext<{ auth: unknown }>()({
  context: {
    handler: ({ context }) => ({ auth: context.auth }),
    dehydrate: ({ data }) => toWire(data),
  },
  component: () => <div className="p-2">root</div>,
})
