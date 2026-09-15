// @ts-nocheck
// Example only - this is a conceptual demonstration

import { createSlotRoute } from '@tanstack/react-router'

export const Route = createSlotRoute({
  path: '/$id',
  loader: async ({ params }) => {
    const message = await fetchMessage(params.id)
    return { message }
  },
  component: MessagePreview,
})

function MessagePreview() {
  const { message } = Route.useLoaderData()

  return (
    <article className="message-preview">
      <header>
        <h2>{message.subject}</h2>
        <div className="message-meta">
          <span>From: {message.from}</span>
          <span>To: {message.to}</span>
          <time>{message.date}</time>
        </div>
      </header>
      <div className="message-body">{message.body}</div>
      <footer className="message-actions">
        <button>Reply</button>
        <button>Forward</button>
        <button>Delete</button>
      </footer>
    </article>
  )
}

async function fetchMessage(id: string) {
  return {
    id,
    from: 'alice@example.com',
    to: 'me@example.com',
    subject: 'Project update',
    date: 'January 4, 2026 at 10:30 AM',
    body: 'Hey! Just wanted to give you a quick update on the project...',
  }
}
