---
name: tanstack-router-navigation
description: |
  Navigation patterns in TanStack Router.
  Use for Link components, programmatic navigation, blocking navigation, route masking.
---

# Navigation

TanStack Router provides type-safe navigation with compile-time route validation. The `<Link>` component handles declarative navigation while `useNavigate` enables programmatic control.

## Common Patterns

### Basic Link Navigation

```tsx
import { Link } from '@tanstack/react-router'

// Simple link
<Link to="/about">About</Link>

// With path parameters
<Link to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</Link>

// With search parameters
<Link to="/posts" search={{ page: 2, filter: 'recent' }}>
  Recent Posts (Page 2)
</Link>

// With hash
<Link to="/docs" hash="installation">
  Jump to Installation
</Link>

// Combining all
<Link
  to="/posts/$postId"
  params={{ postId: '123' }}
  search={{ tab: 'comments' }}
  hash="top"
>
  Post Comments
</Link>
```

### Active Link Styling

```tsx
// Using activeProps/inactiveProps
<Link
  to="/posts"
  activeProps={{ className: 'font-bold text-blue-500' }}
  inactiveProps={{ className: 'text-gray-500' }}
>
  Posts
</Link>

// Control matching behavior
<Link
  to="/posts"
  activeOptions={{
    exact: true,           // Only active on exact match
    includeSearch: true,   // Include search params in match
  }}
  activeProps={{ className: 'active' }}
>
  Posts
</Link>
```

### Preloading on Hover/Intent

```tsx
// Preload route data on hover (default: 'intent')
<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">
  View Post
</Link>

// Preload options
<Link preload="intent" />    // Preload on hover/focus (default)
<Link preload="render" />    // Preload immediately when link renders
<Link preload="viewport" />  // Preload when link enters viewport
<Link preload={false} />     // Disable preloading
```

### Programmatic Navigation

```tsx
import { useNavigate } from '@tanstack/react-router'

function MyComponent() {
  const navigate = useNavigate()

  // Basic navigation
  const goToPost = () => {
    navigate({ to: '/posts/$postId', params: { postId: '123' } })
  }

  // With search params
  const search = () => {
    navigate({ to: '/search', search: { q: 'react' } })
  }

  // Replace history (no back button)
  const replaceRoute = () => {
    navigate({ to: '/dashboard', replace: true })
  }

  // Update only search params (keep current route)
  const updateSearch = () => {
    navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })
  }

  // Navigate with state
  const withState = () => {
    navigate({
      to: '/checkout',
      state: { fromCart: true },
    })
  }
}
```

### Redirect in Loaders/beforeLoad

```tsx
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  loader: async ({ context }) => {
    const user = await fetchUser(context.auth.userId)
    if (!user.hasAccess) {
      throw redirect({
        to: '/upgrade',
        search: { reason: 'access-required' },
      })
    }
    return user
  },
})
```

### Blocking Navigation (Unsaved Changes)

```tsx
import { useBlocker } from '@tanstack/react-router'

function EditForm() {
  const [isDirty, setIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })

  // Or with custom UI
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })

  return (
    <>
      <form onChange={() => setIsDirty(true)}>{/* form fields */}</form>

      {status === 'blocked' && (
        <dialog open>
          <p>You have unsaved changes. Leave anyway?</p>
          <button onClick={proceed}>Leave</button>
          <button onClick={reset}>Stay</button>
        </dialog>
      )}
    </>
  )
}
```

### Route Masking (Display Different URL)

```tsx
// Show /posts/123 in URL but actually navigate to modal route
;<Link
  to="/posts/$postId/modal"
  params={{ postId: '123' }}
  mask={{ to: '/posts/$postId', params: { postId: '123' } }}
>
  Open Post Modal
</Link>

// Programmatic masking
navigate({
  to: '/posts/$postId/modal',
  params: { postId: '123' },
  mask: { to: '/posts/$postId', params: { postId: '123' } },
})
```

## API Quick Reference

```tsx
// Link component props
interface LinkProps {
  to: string                              // Target route
  params?: Record<string, string>         // Path parameters
  search?: object | ((prev) => object)    // Search parameters
  hash?: string                           // URL hash
  replace?: boolean                       // Replace vs push (default: false)
  preload?: 'intent' | 'render' | 'viewport' | false
  activeProps?: HTMLAttributes            // Props when active
  inactiveProps?: HTMLAttributes          // Props when inactive
  activeOptions?: { exact?: boolean; includeSearch?: boolean }
  disabled?: boolean
  mask?: MaskOptions                      // URL masking
}

// useNavigate hook
const navigate = useNavigate()
navigate(options: NavigateOptions): Promise<void>

// redirect function (for loaders/beforeLoad)
throw redirect({ to, params?, search?, replace?, statusCode? })

// useBlocker hook
const { proceed, reset, status } = useBlocker({
  shouldBlockFn: () => boolean,
  withResolver?: boolean,
})

// useLocation hook
const location = useLocation()
// { pathname, search, hash, state, href }

// useRouter hook
const router = useRouter()
router.navigate(options)
router.invalidate()
router.state.location
```

## Detailed References

| Reference                    | When to Use                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `references/links.md`        | Link props, active states, preloading, custom link wrappers |
| `references/programmatic.md` | useNavigate, router.navigate, redirect in loaders           |
| `references/blocking.md`     | Preventing navigation, unsaved changes, useBlocker          |
| `references/masking.md`      | Route masking, display different URL than actual route      |
| `references/history.md`      | History types (browser, hash, memory), state management     |
| `references/rewrites.md`     | URL rewrites, path transformations                          |
