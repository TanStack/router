---
name: tanstack-router-integrations
description: |
  Integrating TanStack Router with external libraries.
  Use for UI frameworks, testing, animations, React Query, and state management.
---

# Integrations

TanStack Router integrates seamlessly with popular React libraries through patterns like `createLink` for UI components and router context for data libraries.

## Common Patterns

### UI Framework Integration (createLink)

The key pattern for UI library integration is `createLink`:

```tsx
import { createLink } from '@tanstack/react-router'
import { Button } from '@chakra-ui/react'  // or any UI library
import { forwardRef } from 'react'

// Wrap any component to make it router-aware
const RouterButton = createLink(
  forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
    (props, ref) => <Button ref={ref} {...props} />
  )
)

// Use with type-safe navigation
<RouterButton to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</RouterButton>
```

### Active State Navigation

```tsx
import { useMatchRoute, Link } from '@tanstack/react-router'

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const matchRoute = useMatchRoute()
  const isActive = matchRoute({ to, fuzzy: true })

  return (
    <Link
      to={to}
      className={isActive ? 'text-blue-600 font-bold' : 'text-gray-600'}
    >
      {children}
    </Link>
  )
}

// Or with exact matching
const isExactMatch = matchRoute({ to: '/posts', fuzzy: false })
```

### React Query Integration

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'

const queryClient = new QueryClient()

// Pass queryClient through router context
const router = createRouter({
  routeTree,
  context: { queryClient },
})

// Root component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

// Use in route loaders
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params, context: { queryClient } }) => {
    return queryClient.ensureQueryData({
      queryKey: ['post', params.postId],
      queryFn: () => fetchPost(params.postId),
    })
  },
})
```

### Zustand State Management

```tsx
import { create } from 'zustand'
import { createRouter } from '@tanstack/react-router'

// Create store
const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))

// Provide to router context
function App() {
  const auth = useAuthStore()
  return <RouterProvider router={router} context={{ auth }} />
}

// Use in beforeLoad
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})
```

### Testing with Vitest

```tsx
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'

function createTestRouter(initialPath = '/') {
  const history = createMemoryHistory({ initialEntries: [initialPath] })
  return createRouter({ routeTree, history })
}

test('renders post page', async () => {
  const router = createTestRouter('/posts/123')
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Post 123')).toBeInTheDocument()
})

test('navigation works', async () => {
  const router = createTestRouter('/')
  render(<RouterProvider router={router} />)

  await userEvent.click(screen.getByText('Go to Posts'))
  expect(router.state.location.pathname).toBe('/posts')
})
```

### Framer Motion Page Transitions

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, Outlet } from '@tanstack/react-router'

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// In root route
export const Route = createRootRoute({
  component: () => (
    <div>
      <Navigation />
      <PageTransition>
        <Outlet />
      </PageTransition>
    </div>
  ),
})
```

### Shadcn/ui Navigation Menu

```tsx
import { Link, useMatchRoute } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  NavigationMenu,
  NavigationMenuItem,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'

function MainNav() {
  const matchRoute = useMatchRoute()

  const items = [
    { to: '/', label: 'Home', exact: true },
    { to: '/posts', label: 'Posts' },
    { to: '/about', label: 'About' },
  ]

  return (
    <NavigationMenu>
      {items.map(({ to, label, exact }) => (
        <NavigationMenuItem key={to}>
          <Link
            to={to}
            className={cn(
              navigationMenuTriggerStyle(),
              matchRoute({ to, fuzzy: !exact }) && 'bg-accent font-medium',
            )}
          >
            {label}
          </Link>
        </NavigationMenuItem>
      ))}
    </NavigationMenu>
  )
}
```

## API Quick Reference

```tsx
// Create router-aware component
const RouterComponent = createLink(forwardRef((props, ref) => (
  <OriginalComponent ref={ref} {...props} />
)))

// Check active route
const matchRoute = useMatchRoute()
matchRoute({ to: '/path', fuzzy?: boolean })  // Returns match or false

// Get current location
const location = useLocation()
// { pathname, search, hash, state }

// Access router state
const isLoading = useRouterState({ select: s => s.isLoading })
const matches = useRouterState({ select: s => s.matches })

// For testing
createMemoryHistory({ initialEntries: ['/path'] })
createRouter({ routeTree, history })
```

## Detailed References

| Reference                     | When to Use                                          |
| ----------------------------- | ---------------------------------------------------- |
| `references/ui-frameworks.md` | Chakra, MUI, Shadcn, Mantine, Radix integration      |
| `references/testing.md`       | Vitest, Jest, Playwright, Testing Library patterns   |
| `references/animations.md`    | Framer Motion, route transitions, loading animations |
| `references/react-query.md`   | TanStack Query integration, prefetching, mutations   |
| `references/state.md`         | Zustand, Jotai, Redux integration patterns           |
