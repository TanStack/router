import { createFileRoute } from '@tanstack/react-router'
import { Foo } from './foo'

export { Foo, Foo as Bar }

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Foo />
}
