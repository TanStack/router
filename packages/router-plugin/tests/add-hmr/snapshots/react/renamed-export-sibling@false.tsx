import { createRootRoute } from '@tanstack/react-router'

export const page = () => <div>Page</div>,
  Route = createRootRoute({
    component: page,
    pendingComponent: () => <div>Loading</div>,
  })
