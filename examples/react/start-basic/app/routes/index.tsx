import { createFileRoute } from '@tanstack/react-router'
import { Test } from '~/components/Test'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!!!</h3>
      <Test />
    </div>
  )
}
