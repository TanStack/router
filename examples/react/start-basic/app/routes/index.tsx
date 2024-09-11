import { createFileRoute } from '@tanstack/react-router'
import { TestComponent } from '~/components/Test'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!! 123 123123</h3>
      <TestComponent />
    </div>
  )
}
