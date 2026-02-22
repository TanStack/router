// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  // Slots render by default - no opt-in needed!
  // Static data for filtering/grouping in parent (type-safe via module declaration)
  staticData: {
    area: 'main',
    priority: 1,
    title: 'Recent Activity',
    collapsible: true,
  },
  loader: async () => {
    const activities = await fetchRecentActivity()
    return { activities }
  },
  component: ActivityWidget,
})

function ActivityWidget() {
  const { activities } = Route.useLoaderData()

  return (
    <ul className="activity-feed">
      {activities.map((item) => (
        <li key={item.id} className="activity-item">
          <img src={item.user.avatar} alt="" className="activity-avatar" />
          <div className="activity-content">
            <strong>{item.user.name}</strong> {item.action}
            <time>{item.timestamp}</time>
          </div>
        </li>
      ))}
    </ul>
  )
}

async function fetchRecentActivity() {
  return [
    {
      id: '1',
      user: { name: 'Alice', avatar: '/a.jpg' },
      action: 'created a new project',
      timestamp: '5m ago',
    },
    {
      id: '2',
      user: { name: 'Bob', avatar: '/b.jpg' },
      action: 'completed a task',
      timestamp: '12m ago',
    },
    {
      id: '3',
      user: { name: 'Carol', avatar: '/c.jpg' },
      action: 'left a comment',
      timestamp: '1h ago',
    },
  ]
}
