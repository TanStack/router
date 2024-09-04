import { createFileRoute } from '@tanstack/react-router'
import { Example } from '~/components/Example'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Homs</h3>
      <Example />
    </div>
  )
}
