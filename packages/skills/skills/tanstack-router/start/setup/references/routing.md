# Start Routing

Start-specific routing patterns beyond basic Router.

## File Structure

```
app/
├── routes/
│   ├── __root.tsx       # Root layout
│   ├── index.tsx        # /
│   ├── api/             # API routes
│   │   └── health.ts    # /api/health
│   └── posts/
│       ├── index.tsx    # /posts
│       └── $postId.tsx  # /posts/:postId
```

## API Routes vs Page Routes

```tsx
// Page route (routes/posts/index.tsx)
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsPage, // React component
})

// API route (routes/api/posts.ts)
import { createAPIFileRoute } from '@tanstack/start/api'

export const APIRoute = createAPIFileRoute('/api/posts')({
  GET: async () => json(await getPosts()), // HTTP handler
})
```

## Mixing Server Functions and Loaders

```tsx
// Server function for reusable server logic
const getPosts = createServerFn().handler(async () => db.post.findMany())

// Use in loader
export const Route = createFileRoute('/posts/')({
  loader: () => getPosts(),
  component: PostsPage,
})

// Also callable from components
function RefreshButton() {
  const handleRefresh = async () => {
    const posts = await getPosts()
    // Update state
  }
}
```

## Nested Layouts with Data

```tsx
// routes/dashboard.tsx (layout)
export const Route = createFileRoute('/dashboard')({
  loader: async () => ({
    user: await getUser(),
    notifications: await getNotifications(),
  }),
  component: DashboardLayout,
})

function DashboardLayout() {
  const { user, notifications } = Route.useLoaderData()

  return (
    <div>
      <DashboardNav user={user} notifications={notifications} />
      <Outlet /> {/* Child routes */}
    </div>
  )
}
```

## Route Groups for Organization

```
routes/
├── (marketing)/        # No URL impact
│   ├── about.tsx       # /about
│   └── pricing.tsx     # /pricing
├── (app)/
│   ├── _layout.tsx     # Shared app layout
│   ├── dashboard.tsx   # /dashboard
│   └── settings.tsx    # /settings
```

## SSR vs Client Navigation

```tsx
export const Route = createFileRoute('/posts/')({
  loader: async () => {
    // First load (SSR): Runs on server
    // Client navigation: Runs via server function (RPC)
    return getPosts()
  },
})
```
