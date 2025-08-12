import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/error-component-test')({
  component: () => <div>Testing errorComponent types</div>,
  errorComponent: false,
  pendingComponent: undefined,
  notFoundComponent: undefined,
})
