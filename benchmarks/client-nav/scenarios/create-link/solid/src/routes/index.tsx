import { createFileRoute } from '@tanstack/solid-router'
import { LinkListToggle } from '../linkList'
import { readyTestId } from '../../../shared'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main>
      <p data-testid={readyTestId}>home</p>
      <LinkListToggle />
    </main>
  )
}
