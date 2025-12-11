import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from 'src/components/NotFound'
import { UserErrorComponent } from 'src/components/UserError'
import { fetchUser } from '../utils/users'

export const Route = createFileRoute('/users/$userId')({
  loader: ({ params: { userId } }) => fetchUser({ data: userId }),
  errorComponent: UserErrorComponent,
  component: UserComponent,
  notFoundComponent: () => {
    return <NotFound>User not found</NotFound>
  },
})

/**
 * Displays a user's name, email, and a link to view the user's data as JSON.
 *
 * Renders the loaded user from route loader data with the name as a bold, underlined heading, the email in smaller text, and a "View as JSON" link to `/api/users/{id}`.
 *
 * @returns A JSX element rendering the user's name, email, and JSON view link
 */
function UserComponent() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{user.name}</h4>
      <div className="text-sm">{user.email}</div>
      <div>
        <a
          href={`/api/users/${user.id}`}
          className="text-blue-800 hover:text-blue-600 underline"
        >
          View as JSON
        </a>
      </div>
    </div>
  )
}
