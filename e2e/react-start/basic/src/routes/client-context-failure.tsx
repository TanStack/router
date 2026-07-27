import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/client-context-failure')({
  context: () => {
    if (typeof window !== 'undefined') {
      throw new Error('Client context reconstruction failed')
    }
    return { serverContext: true }
  },
  component: ClientContextSuccess,
  errorComponent: ({ error }) => (
    <div data-testid="client-context-error">{error.message}</div>
  ),
})

function ClientContextSuccess() {
  if (typeof window !== 'undefined') {
    const testWindow = window as any
    testWindow.__clientContextSuccessRenders =
      (testWindow.__clientContextSuccessRenders ?? 0) + 1
  }
  return <div data-testid="client-context-success">server success</div>
}
