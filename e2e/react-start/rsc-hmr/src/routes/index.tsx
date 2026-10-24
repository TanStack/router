import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return <h1 data-testid="index-title">RSC HMR fixtures</h1>
}
