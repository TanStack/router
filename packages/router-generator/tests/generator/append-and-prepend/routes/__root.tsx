import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  validateSearch: () => ({
    search: 'search',
  }),
})
