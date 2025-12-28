import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

/**
 * Renders the home view containing a padded container with a welcome heading.
 *
 * @returns A React element that renders a div with a "Welcome Home!!!" heading.
 */
function Home() {
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
    </div>
  )
}
