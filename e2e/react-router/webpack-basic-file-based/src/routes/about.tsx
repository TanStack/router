import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutComponent,
})

function AboutComponent() {
  return (
    <div>
      <h3>About</h3>
    </div>
  )
}
