import { createRootRoute } from '@tanstack/react-router'

const Route = createRootRoute({
  component: () => <div>Root Layout</div>,
})

export { Route }
