// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

// Activity index - shows all activity
export const Route = createSlotRoute({
  path: '/',
  loader: async () => {
    // This runs in PARALLEL with dashboard.loader and other widget loaders
    const activities = await fetchAllActivities()
    return { activities }
  },
  component: AllActivities,
})

function AllActivities() {
  const { activities } = Route.useLoaderData()

  return (
    <ul className="activity-list">
      {activities.map((activity) => (
        <li key={activity.id} className="activity-item">
          <span className="activity-user">{activity.user}</span>
          <span className="activity-action">{activity.action}</span>
          <time className="activity-time">{activity.time}</time>
        </li>
      ))}
    </ul>
  )
}

async function fetchAllActivities() {
  return [
    { id: '1', user: 'Alice', action: 'created a new project', time: '2m ago' },
    { id: '2', user: 'Bob', action: 'commented on task', time: '5m ago' },
    { id: '3', user: 'Carol', action: 'completed milestone', time: '1h ago' },
  ]
}
