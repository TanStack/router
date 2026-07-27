import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/preload-disabled')({
  preload: false,
  component: () => <div data-testid="preload-disabled">preload disabled</div>,
})
