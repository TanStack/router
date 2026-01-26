# Outlets

Render child routes within parent layouts.

## Basic Outlet

```tsx
import { Outlet } from '@tanstack/react-router'

function RootLayout() {
  return (
    <div>
      <header>
        <nav>...</nav>
      </header>
      <main>
        <Outlet /> {/* Child routes render here */}
      </main>
      <footer>...</footer>
    </div>
  )
}
```

## How Outlets Work

When URL matches `/posts/123`:

```
Root Layout (/)
  └── <Outlet /> renders Posts Layout (/posts)
        └── <Outlet /> renders Post Page (/posts/$postId)
```

Each parent renders an `<Outlet />` for its children.

## Nested Outlets

```tsx
// routes/__root.tsx
function Root() {
  return (
    <div className="app">
      <Navbar />
      <Outlet /> {/* Level 1 children */}
    </div>
  )
}

// routes/posts.tsx
function PostsLayout() {
  return (
    <div className="posts-layout">
      <Sidebar />
      <div className="content">
        <Outlet /> {/* Level 2 children */}
      </div>
    </div>
  )
}

// routes/posts/$postId.tsx
function Post() {
  // Final leaf - no Outlet needed
  return <article>...</article>
}
```

## Outlet with Context

Pass data to child routes:

```tsx
function PostsLayout() {
  const categories = Route.useLoaderData()

  return (
    <div>
      <CategoryNav categories={categories} />
      <Outlet />
    </div>
  )
}

// Child accesses via route context
function PostPage() {
  const { categories } = Route.useRouteContext()
}
```

## Conditional Outlets

```tsx
function Dashboard() {
  const user = Route.useRouteContext().user

  return (
    <div>
      <h1>Dashboard</h1>
      {user.isVerified ? <Outlet /> : <VerificationPrompt />}
    </div>
  )
}
```

## Multiple Content Areas

For complex layouts, use named outlets via parallel routes:

```tsx
// See parallel-routes.md for multi-slot layouts
```
