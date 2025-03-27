import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import axios from 'redaxios'
import { DEPLOY_URL } from '../utils/users'
import type { User } from '../utils/users'
import { t } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'

export const Route = createFileRoute('/users')({
  loader: async () => {
    return await axios
      .get<Array<User>>(DEPLOY_URL + '/api/users')
      .then((r) => r.data)
      .catch(() => {
        throw new Error(t`Failed to fetch users`)
      })
  },
  component: UsersLayoutComponent,
})

function UsersLayoutComponent() {
  const { t } = useLingui()
  const users = Route.useLoaderData()

  return (
    <div className="p-2 flex gap-2">
      <ul className="list-disc pl-4">
        {[
          ...users,
          { id: 'i-do-not-exist', name: t`Non-existent User`, email: '' },
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
