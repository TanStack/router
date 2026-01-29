# Parallel Routes

Render multiple route branches simultaneously.

## Use Cases

- Dashboard with independent panels
- Modal over page content
- Split-view interfaces
- Multi-slot layouts

## Basic Parallel Routes

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  component: () => (
    <div className="layout">
      <Outlet />
      <Outlet name="modal" />
    </div>
  ),
})
```

## File-Based Parallel Routes

Use `@` prefix for parallel route slots:

```
routes/
├── __root.tsx
├── dashboard.tsx
├── dashboard@sidebar.tsx    # Renders in "sidebar" slot
└── dashboard@main.tsx       # Renders in "main" slot
```

```tsx
// routes/dashboard.tsx
function DashboardLayout() {
  return (
    <div className="dashboard">
      <aside>
        <Outlet name="sidebar" />
      </aside>
      <main>
        <Outlet name="main" />
      </main>
    </div>
  )
}
```

## Modal Pattern

Show modal without losing page state:

```tsx
// routes/__root.tsx
function Root() {
  return (
    <>
      <Outlet /> {/* Main content */}
      <Outlet name="modal" /> {/* Modal overlay */}
    </>
  )
}

// routes/posts.tsx - main slot
// routes/posts@modal.$postId.tsx - modal slot

// Clicking a post opens modal while keeping list visible
;<Link to="/posts" search={{ modal: postId }}>
  View Post
</Link>
```

## Independent Loading

Each parallel route loads independently:

```tsx
// dashboard@sidebar.tsx
export const Route = createFileRoute('/dashboard@sidebar')({
  loader: async () => fetchSidebarData(), // Loads in parallel
  component: Sidebar,
})

// dashboard@main.tsx
export const Route = createFileRoute('/dashboard@main')({
  loader: async () => fetchMainData(), // Loads in parallel
  component: MainContent,
})
```

## Slot Communication

Use search params or context for slot coordination:

```tsx
const searchSchema = z.object({
  selectedItem: z.string().optional(),
})

// Sidebar selects item
navigate({ search: { selectedItem: id } })

// Main reacts to selection
const { selectedItem } = Route.useSearch()
```
