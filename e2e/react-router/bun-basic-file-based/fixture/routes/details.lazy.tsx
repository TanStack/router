import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/details')({
  component: () => <h1>DETAILS_DYNAMIC_BUN</h1>,
})
