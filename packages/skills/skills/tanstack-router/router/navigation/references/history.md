# History Management

Control browser history behavior and types.

## History Types

### Browser History (Default)

Standard HTML5 history with clean URLs:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  routeTree,
  // Browser history is default
})
```

### Hash History

URLs with `#` prefix, useful for static hosting:

```tsx
import { createRouter } from '@tanstack/react-router'
import { createHashHistory } from '@tanstack/history'

const hashHistory = createHashHistory()

const router = createRouter({
  routeTree,
  history: hashHistory,
})
```

URLs look like: `https://example.com/#/posts/123`

### Memory History

No URL changes, useful for testing or embedded apps:

```tsx
import { createMemoryHistory } from '@tanstack/history'

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'],
})

const router = createRouter({
  routeTree,
  history: memoryHistory,
})
```

## History State

Pass state with navigation:

```tsx
navigate({
  to: '/posts/$postId',
  params: { postId: '123' },
  state: {
    fromList: true,
    scrollPosition: 500,
  },
})
```

Access in component:

```tsx
function Post() {
  const { state } = useLocation()
  // state: { fromList: true, scrollPosition: 500 }
}
```

## Replace vs Push

```tsx
// Push (default) - adds to history stack
navigate({ to: '/posts' })

// Replace - replaces current entry
navigate({ to: '/posts', replace: true })
```

## Accessing History

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  // Current location
  const location = router.state.location

  // Go back/forward
  router.history.back()
  router.history.forward()
  router.history.go(-2) // Go back 2 entries
}
```
