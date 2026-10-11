import { createFileRoute } from '@tanstack/react-router'
import { Counter } from '../components/Counter'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Counter />
    </div>
  )
}
