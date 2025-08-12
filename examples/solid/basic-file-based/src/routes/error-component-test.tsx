import { createFileRoute } from '@tanstack/solid-router'

// Test route for errorComponent type safety
// This tests that errorComponent can be set to false, null, or undefined
// without causing build-time TypeScript errors
export const Route = createFileRoute('/error-component-test')({
  component: () => <div>Testing errorComponent types</div>,
  errorComponent: false, // Should not cause TypeScript error
  pendingComponent: undefined, // Should not cause TypeScript error
  notFoundComponent: undefined, // Should not cause TypeScript error
})
