import { createFileRoute } from '@tanstack/react-router'
import { Foo } from '~/foo'

export const Route = createFileRoute('/')({
  loader: () => new Foo('xyz'),
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
    </div>
  )
}
