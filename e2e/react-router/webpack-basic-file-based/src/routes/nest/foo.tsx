import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nest/foo')({
  component: NestFooComponent,
})

function NestFooComponent() {
  return (
    <div>
      <h3>Nest Foo</h3>
    </div>
  )
}
