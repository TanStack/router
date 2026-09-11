import { createFileRoute, Link } from '@tanstack/react-router'
import { readGoal } from '../server/goal'
export const Route = createFileRoute('/saved')({
  loader: () => readGoal(),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: Saved,
})
function Saved() {
  const goal = Route.useLoaderData()
  return (
    <main>
      <h1>Goal saved</h1>
      <p>{goal}</p>
      <Link to="/">Edit your goal</Link>
    </main>
  )
}
