import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { fetchUsers } from '../utils/users'

export const Route = createFileRoute('/users')({
  loader: () => fetchUsers(),
  component: UsersComponent,
})

/**
 * Renders the users list with navigation links and a nested-route outlet.
 *
 * The component reads loader-provided user data and renders each user as a link to `/users/$userId`.
 * It appends a hard-coded "Non-existent User" item to the list. Below the list it renders an `<Outlet />` for nested routes.
 *
 * @returns A JSX element containing the user list with links and an Outlet for nested route content.
 */
function UsersComponent() {
  const users = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[
          ...users,
          { id: 'i-do-not-exist', name: 'Non-existent User', email: '' },
        ].map((user) => {
          return (
            <li key={user.id} className="whitespace-nowrap">
              <Link
                to="/users/$userId"
                params={{
                  userId: String(user.id),
                }}
                className="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{ className: 'text-black font-bold' }}
              >
                <div>{user.name}</div>
              </Link>
            </li>
          )
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}