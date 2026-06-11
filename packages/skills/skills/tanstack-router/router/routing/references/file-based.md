# File-Based Routing

File-based routing organizes routes using your filesystem. The route tree is auto-generated from the `routes/` directory.

## Directory Structure

```
src/routes/
├── __root.tsx          # Root layout (required)
├── index.tsx           # / (home)
├── about.tsx           # /about
├── posts/
│   ├── index.tsx       # /posts
│   └── $postId.tsx     # /posts/:postId
└── _layout.tsx         # Pathless layout wrapper
```

## File Naming Conventions

| Pattern          | URL Result   | Purpose                         |
| ---------------- | ------------ | ------------------------------- |
| `about.tsx`      | `/about`     | Static segment                  |
| `index.tsx`      | Parent path  | Default child route             |
| `$param.tsx`     | `/:param`    | Dynamic segment                 |
| `$.tsx`          | `/*`         | Splat/catch-all                 |
| `_layout.tsx`    | -            | Pathless layout (no URL change) |
| `(group)/`       | -            | Route group (no URL change)     |
| `posts_.$id.tsx` | `/posts/:id` | Flat file with nesting          |
| `-excluded.tsx`  | -            | Excluded from routing           |

## Route File Structure

```tsx
// routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

## Pathless Layouts

Wrap routes without affecting URL:

```tsx
// routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/login' })
  },
  component: () => <Outlet />,
})
```

Children in `routes/_authenticated/` inherit this guard.

## Route Groups

Organize files without URL impact:

```
routes/
├── (marketing)/
│   ├── about.tsx      # /about
│   └── pricing.tsx    # /pricing
└── (app)/
    └── dashboard.tsx  # /dashboard
```

## Flat File Syntax

Use `.` to represent nesting in flat files:

```
routes/
├── posts.tsx          # /posts (layout)
├── posts.index.tsx    # /posts
└── posts.$id.tsx      # /posts/:id
```

Use `_` suffix to break out of nesting:

```
routes/
├── posts.tsx          # /posts layout
├── posts.$id.tsx      # /posts/:id (nested)
└── posts_.$id.edit.tsx # /posts/:id/edit (NOT nested under posts layout)
```
