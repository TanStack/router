import { createFileRoute } from '@tanstack/router'

// Test edge cases with true, undefined, and mixed scenarios
export const Route = createFileRoute('/edge-test')({
  component: () => <div>Edge Test</div>,
  errorComponent: true, // BooleanLiteral with true value
  pendingComponent: undefined, // Should be handled by existing logic
  loader: async () => ({ data: 'edge' }),
})
