# Programmatic Navigation

Navigate imperatively using hooks and router methods.

## useNavigate Hook

```tsx
import { useNavigate } from '@tanstack/react-router'

function Component() {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate({ to: '/posts/$postId', params: { postId: '123' } })
  }

  return <button onClick={handleClick}>Go to Post</button>
}
```

## Navigate Options

```tsx
navigate({
  to: '/posts/$postId',
  params: { postId: '123' },
  search: { tab: 'comments' },
  hash: 'section-1',
  replace: true, // Replace instead of push
  resetScroll: true, // Reset scroll position
  state: { fromButton: true }, // History state
})
```

## Relative Navigation

```tsx
// From /posts/123
navigate({ to: '..' }) // → /posts
navigate({ to: '../456' }) // → /posts/456
navigate({ to: './edit' }) // → /posts/123/edit
```

## Search Param Updates

```tsx
// Replace entire search
navigate({ search: { page: 2 } })

// Merge with existing
navigate({
  search: (prev) => ({ ...prev, page: prev.page + 1 }),
})

// Remove param
navigate({
  search: (prev) => ({ ...prev, filter: undefined }),
})
```

## Router Instance

Access router directly for navigation outside React:

```tsx
import { router } from './router'

// Anywhere in your app
router.navigate({ to: '/posts' })

// In loaders
export const Route = createFileRoute('/posts/$postId')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      // Use redirect in loaders, not navigate
      throw redirect({ to: '/login' })
    }
  },
})
```

## redirect()

Throw redirects in loaders/beforeLoad:

```tsx
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})
```

## useRouter

Access router instance in components:

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  // Access current state
  console.log(router.state.location)

  // Navigate
  router.navigate({ to: '/posts' })
}
```

## API Reference

### useNavigate Hook

```tsx
function useNavigate<TFrom>(options?: { from?: TFrom }): NavigateFunction

type NavigateFunction = (options: NavigateOptions) => Promise<void>

interface NavigateOptions {
  to: string // Target route
  params?: Record<string, string> // Path parameters
  search?: object | ((prev) => object) // Search params
  hash?: string // URL hash
  state?: Record<string, any> // History state
  replace?: boolean // Replace history (default: false)
  resetScroll?: boolean // Reset scroll (default: true)
  from?: string // Source route (for relative nav)
  mask?: MaskOptions // URL masking
}
```

### useRouter Hook

```tsx
function useRouter(): Router

interface Router {
  state: RouterState // Current router state
  navigate: NavigateFunction // Navigate method
  history: RouterHistory // History instance
  routeTree: RouteTree // Route tree
  matchRoute: (opts) => RouteMatch | false
  invalidate: () => Promise<void> // Invalidate all loaders
  load: () => Promise<void> // Load current route
}
```

### redirect Function

```tsx
function redirect(options: RedirectOptions): never

interface RedirectOptions extends NavigateOptions {
  throw?: boolean // Default: true
  reloadDocument?: boolean // Full page reload
  statusCode?: 301 | 302 | 307 | 308 // For SSR (default: 302)
  headers?: Record<string, string> // Response headers
}
```

### useLocation Hook

```tsx
function useLocation<TSelected>(options?: {
  select?: (location: ParsedLocation) => TSelected
}): TSelected | ParsedLocation

interface ParsedLocation {
  pathname: string
  search: Record<string, any>
  hash: string
  state: Record<string, any>
  href: string
  searchStr: string
  maskedLocation?: ParsedLocation
}
```
