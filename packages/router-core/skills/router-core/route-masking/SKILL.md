---
name: router-core/route-masking
description: >-
  Route masking: showing a different URL in the browser bar than the actual
  route being rendered. mask option on Link/navigate, createRouteMask for
  declarative masking, unmaskOnReload, type-safe mask options,
  location.state-based storage, automatic unmasking on URL sharing.
type: sub-skill
library: tanstack-router
library_version: '1.166.2'
requires:
  - router-core
  - router-core/navigation
sources:
  - TanStack/router:docs/router/guide/route-masking.md
---

# Route Masking

Route masking shows a different URL in the browser bar than the actual route being rendered. The masked URL is what gets persisted to the browser's history and URL bar. The real route location is stored in `location.state` and used internally by the router.

> **KEY CONCEPT**: Masking data lives in `location.state` (browser history). When a masked URL is copied, shared, or opened in a new tab, the masking data is lost and the browser navigates to the visible (masked) URL directly. This is by design.

## When to Use Route Masking

- Modal routes: navigate to `/photos/$photoId/modal` but show `/photos/$photoId` in the URL bar
- Hiding internal search params: navigate with `?showLogin=true` but mask the URL to exclude it
- Parallel route patterns: render one route while displaying a different URL

## Imperative Masking on `<Link>`

The `mask` option accepts the same navigation options as `Link` itself (`to`, `params`, `search`, `hash`, `replace`). It is fully type-safe.

```tsx
import { Link } from '@tanstack/react-router'

function PhotoGrid({ photoId }: { photoId: string }) {
  return (
    <Link
      to="/photos/$photoId/modal"
      params={{ photoId }}
      mask={{
        to: '/photos/$photoId',
        params: { photoId },
      }}
    >
      Open Photo
    </Link>
  )
}
```

## Imperative Masking with `useNavigate`

```tsx
import { useNavigate } from '@tanstack/react-router'

function OpenPhotoButton({ photoId }: { photoId: string }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() =>
        navigate({
          to: '/photos/$photoId/modal',
          params: { photoId },
          mask: {
            to: '/photos/$photoId',
            params: { photoId },
          },
        })
      }
    >
      Open Photo
    </button>
  )
}
```

## Declarative Masking with `createRouteMask`

Instead of adding `mask` to every `<Link>`, define masks at the router level. Any navigation matching the `from` route automatically gets masked.

```tsx
import { createRouter, createRouteMask } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const photoModalMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: (prev) => ({ photoId: prev.photoId }),
})

const router = createRouter({
  routeTree,
  routeMasks: [photoModalMask],
})
```

`createRouteMask` requires:
- `routeTree` — the route tree for type inference
- `from` — the route ID to match for masking
- Standard navigation options (`to`, `params`, `search`, etc.) for the masked URL

Both `from` and the navigation options are type-safe.

## Unmasking Behavior

### URL Sharing (automatic)

Masked URLs are automatically unmasked when shared. Copying a URL from the address bar copies the masked (visible) URL. Opening it in a new tab navigates to that visible URL without masking data.

### Page Reload (configurable)

By default, masks **survive** local page reloads because `location.state` persists in the browser history stack. To unmask on reload, configure at three levels (each overrides the previous):

```tsx
// 1. Router-wide default
const router = createRouter({
  routeTree,
  unmaskOnReload: true,
})

// 2. Per-mask
const mask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: (prev) => ({ photoId: prev.photoId }),
  unmaskOnReload: true,
})

// 3. Per-link (highest priority)
<Link
  to="/photos/$photoId/modal"
  params={{ photoId }}
  mask={{ to: '/photos/$photoId', params: { photoId } }}
  unmaskOnReload
>
  Open Photo
</Link>
```

## Common Mistakes

### 1. MEDIUM: Expecting masked URLs to survive sharing

Masking data lives in `location.state` (browser history). When a masked URL is copied, shared, or opened in a new tab, the masking data is lost. The browser navigates to the visible (masked) URL directly. Ensure the masked URL resolves to a valid, meaningful route.

```tsx
// The user sees /photos/5 in the URL bar
// If they copy/paste it, they navigate to /photos/5 (not /photos/5/modal)
// Make sure /photos/5 is a valid route that renders something useful
<Link
  to="/photos/$photoId/modal"
  params={{ photoId: '5' }}
  mask={{ to: '/photos/$photoId', params: { photoId: '5' } }}
>
  Open Photo
</Link>
```

## Cross-References

- **router-core/navigation** — `mask` is an option on `Link` and `useNavigate`, using the same `to`/`params`/`search` navigation options.
- **router-core/not-found-and-errors** — if the masked URL doesn't match a route, standard not-found handling applies.
- **router-core/type-safety** — both `createRouteMask` and the `mask` option on `Link`/`navigate` are fully type-safe.
