// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute, Link } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/inbox',
  loader: async () => {
    const messages = await fetchInboxMessages()
    return { messages }
  },
  component: InboxList,
})

function InboxList() {
  const { messages } = Route.useLoaderData()

  return (
    <div className="message-list">
      <h2>Inbox</h2>
      <ul>
        {messages.map((msg) => (
          <li key={msg.id}>
            {/* Clicking a message opens it in the preview slot */}
            <Link slot="preview" to="/$id" params={{ id: msg.id }}>
              <strong>{msg.from}</strong>
              <span>{msg.subject}</span>
              <time>{msg.date}</time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

async function fetchInboxMessages() {
  return [
    { id: 'msg-1', from: 'Alice', subject: 'Project update', date: '10:30 AM' },
    { id: 'msg-2', from: 'Bob', subject: 'Re: Meeting notes', date: '9:15 AM' },
    {
      id: 'msg-3',
      from: 'Carol',
      subject: 'Quick question',
      date: 'Yesterday',
    },
  ]
}
