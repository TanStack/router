import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/issue-4614')({
  ssr: false,
  beforeLoad: ({ context, cause, preload }) => {
    ;(globalThis as any).__issue4614TargetBeforeLoad = {
      cause,
      preload,
      isClient: context.isClient,
      isServer: context.isServer,
    }
  },
  component: () => <div data-testid="issue-4614-page">Issue 4614</div>,
})
