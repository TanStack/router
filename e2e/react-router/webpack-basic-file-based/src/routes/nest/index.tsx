import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nest/')({
  component: NestIndexComponent,
})

function NestIndexComponent() {
  return (
    <div>
      <h3>Nest Index</h3>
    </div>
  )
}
