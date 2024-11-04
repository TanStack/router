import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import {
  gql,
  TypedDocumentNode,
  useSuspenseQuery,
} from '@apollo/client/index.js'

export const Route = createFileRoute('/users')({
  component: UsersComponent,
})

const USERS_QUERY: TypedDocumentNode<{
  users: { data: Array<{ id: string; name: string }> }
}> = gql`
  query GetUsers {
    users {
      data {
        id
        name
      }
    }
  }
`

function UsersComponent() {
  const users = useSuspenseQuery(USERS_QUERY).data.users.data

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
