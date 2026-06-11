# Layouts

Shared UI that wraps multiple routes.

## Layout Routes

A route with children acts as a layout:

```tsx
// routes/posts.tsx - Layout for /posts/*
export const Route = createFileRoute('/posts')({
  component: PostsLayout,
})

function PostsLayout() {
  return (
    <div>
      <h1>Posts</h1>
      <nav>
        <Link to="/posts">All</Link>
        <Link to="/posts/new">New</Link>
      </nav>
      <Outlet /> {/* Child routes render here */}
    </div>
  )
}
```

## Pathless Layouts

Wrap routes without affecting URL:

```tsx
// routes/_app.tsx
export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
```

Children in `routes/_app/` get this layout without `/_app` in URL.

## Multiple Layouts

Nest layouts for complex UIs:

```
routes/
├── __root.tsx           # Global layout
├── _app.tsx             # App shell (sidebar)
├── _app/
│   ├── dashboard.tsx    # /dashboard
│   └── settings.tsx     # /settings
├── _marketing.tsx       # Marketing layout
└── _marketing/
    ├── about.tsx        # /about
    └── pricing.tsx      # /pricing
```

## Layout with Data

Layouts can load data for children:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    return { categories: await fetchCategories() }
  },
  component: PostsLayout,
})

// routes/posts/$postId.tsx
function PostComponent() {
  // Access parent loader data via context
  const { categories } = Route.useRouteContext()
}
```

## Authenticated Layout Pattern

```tsx
// routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: '/login' })
    }
    return { user: context.auth.user }
  },
  component: () => <Outlet />,
})
```

All routes under `_authenticated/` require auth.
