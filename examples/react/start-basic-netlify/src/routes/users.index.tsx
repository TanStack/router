import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/')({
  component: UsersIndexComponent,
})

/**
 * Renders the users index view with a prompt and a link to the JSON users API.
 *
 * @returns A React element containing a message and an anchor linking to `/api/users`.
 */
function UsersIndexComponent() {
  return (
    <div>
      Select a user or{' '}
      <a
        href="/api/users"
        className="text-blue-800 hover:text-blue-600 underline"
      >
        view as JSON
      </a>
    </div>
  )
}
