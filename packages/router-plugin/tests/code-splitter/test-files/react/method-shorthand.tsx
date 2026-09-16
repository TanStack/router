import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/')({
  async loader({ context }) {
    return await fetchPosts(context)
  },
  component() {
    return <Component />
  },
  pendingComponent() {
    return <PendingComponent />
  },
  notFoundComponent() {
    return <NotFoundComponent />
  },
  errorComponent() {
    return <ErrorComponent />
  },
})

function Component() {
  return <div>Component</div>
}

function PendingComponent() {
  return <div>Pending</div>
}

function NotFoundComponent() {
  return <div>Not found</div>
}

function ErrorComponent() {
  return <div>Error</div>
}
