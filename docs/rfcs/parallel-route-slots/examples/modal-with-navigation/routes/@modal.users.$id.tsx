// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'

// User profile modal - shown when @modal=/users/123
export const Route = createSlotRoute({
  path: '/users/$id',
  validateSearch: z.object({
    tab: z.enum(['profile', 'activity', 'settings']).default('profile'),
  }),
  loader: async ({ params }) => {
    const user = await fetchUser(params.id)
    return { user }
  },
  component: UserModal,
})

function UserModal() {
  const { user } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const params = Route.useParams()

  return (
    <div className="user-modal">
      <header>
        <img src={user.avatar} alt={user.name} />
        <h2>{user.name}</h2>
      </header>

      {/* Tab navigation within the modal */}
      <nav className="tabs">
        <Link
          slot="modal"
          to="/users/$id"
          params={params}
          search={{ tab: 'profile' }}
          className={tab === 'profile' ? 'active' : ''}
        >
          Profile
        </Link>
        <Link
          slot="modal"
          to="/users/$id"
          params={params}
          search={{ tab: 'activity' }}
          className={tab === 'activity' ? 'active' : ''}
        >
          Activity
        </Link>
        <Link
          slot="modal"
          to="/users/$id"
          params={params}
          search={{ tab: 'settings' }}
          className={tab === 'settings' ? 'active' : ''}
        >
          Settings
        </Link>
      </nav>

      {/* Tab content */}
      <div className="tab-content">
        {tab === 'profile' && <UserProfile user={user} />}
        {tab === 'activity' && <UserActivity user={user} />}
        {tab === 'settings' && <UserSettings user={user} />}
      </div>
    </div>
  )
}

// Placeholder components
function UserProfile({ user }) {
  return <div>Profile for {user.name}</div>
}
function UserActivity({ user }) {
  return <div>Activity for {user.name}</div>
}
function UserSettings({ user }) {
  return <div>Settings for {user.name}</div>
}

// Placeholder fetch
async function fetchUser(id: string) {
  return { id, name: 'John Doe', avatar: '/avatars/john.jpg' }
}
