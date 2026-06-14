// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'sidebar',
    priority: 2,
  },
  loader: async ({ context }) => {
    const user = await fetchUserProfile(context.user.id)
    return { user }
  },
  component: UserCardWidget,
})

function UserCardWidget() {
  const { user } = Route.useLoaderData()

  return (
    <div className="user-card">
      <img src={user.avatar} alt={user.name} className="user-avatar" />
      <h4>{user.name}</h4>
      <p className="user-role">{user.role}</p>
      <div className="user-stats">
        <div className="user-stat">
          <span className="stat-value">{user.projects}</span>
          <span className="stat-label">Projects</span>
        </div>
        <div className="user-stat">
          <span className="stat-value">{user.tasks}</span>
          <span className="stat-label">Tasks</span>
        </div>
      </div>
      {/* Open modal from dashboard - Route.Link has implicit from */}
      <Route.Link
        slots={{ modal: { to: '/users/$id', params: { id: user.id } } }}
      >
        View Profile
      </Route.Link>
    </div>
  )
}

async function fetchUserProfile(userId: string) {
  return {
    id: userId,
    name: 'Jane Doe',
    role: 'Product Manager',
    avatar: '/avatars/jane.jpg',
    projects: 8,
    tasks: 24,
  }
}
