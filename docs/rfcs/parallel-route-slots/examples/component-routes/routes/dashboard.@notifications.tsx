// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'main',
    priority: 3,
    title: 'Notifications',
    collapsible: true,
  },
  // Opt-out: disable if user turned off in preferences
  enabled: ({ context }) => {
    return context.user.preferences?.showNotificationsWidget !== false
  },
  loader: async () => {
    const notifications = await fetchNotifications()
    return { notifications }
  },
  component: NotificationsWidget,
})

function NotificationsWidget() {
  const { notifications } = Route.useLoaderData()

  if (notifications.length === 0) {
    return <p className="empty-state">No new notifications</p>
  }

  return (
    <ul className="notifications-list">
      {notifications.map((notif) => (
        <li
          key={notif.id}
          className={`notification ${notif.read ? 'read' : 'unread'}`}
        >
          <span className="notification-icon">{notif.icon}</span>
          <div className="notification-content">
            <p>{notif.message}</p>
            <time>{notif.time}</time>
          </div>
        </li>
      ))}
    </ul>
  )
}

async function fetchNotifications() {
  return [
    {
      id: '1',
      icon: '📬',
      message: 'New message from Alice',
      time: '2m ago',
      read: false,
    },
    {
      id: '2',
      icon: '✅',
      message: 'Task "Update docs" completed',
      time: '1h ago',
      read: false,
    },
    {
      id: '3',
      icon: '🎉',
      message: 'You earned a new badge!',
      time: '3h ago',
      read: true,
    },
  ]
}
