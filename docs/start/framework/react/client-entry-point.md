---
id: client-entry-point
title: Client Entry Point
---

# Client Entry Point

> [!NOTE]
> The client entry point is **optional** out of the box. If not provided, TanStack Start will automatically handle the client entry point for you using the below as a default.

Getting our html to the client is only half the battle. Once there, we need to hydrate our client-side JavaScript once the route resolves to the client. We do this by hydrating the root of our application with the `StartClient` component:

```tsx
// src/client.tsx
import { StartClient } from '@tanstack/react-start'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient router={router} />
  </StrictMode>,
)
```

This enables us to kick off client-side routing once the user's initial server request has fulfilled.

## Custom Client Configuration

You can customize the client entry point to add global providers, error boundaries, or other client-specific setup:

```tsx
// src/client.tsx
import { StartClient } from '@tanstack/react-start'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createRouter } from './router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const router = createRouter()
const queryClient = new QueryClient()

hydrateRoot(
  document,
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StartClient router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

## Error Handling

You can wrap your client entry point with error boundaries to handle client-side errors gracefully:

```tsx
// src/client.tsx
import { StartClient } from '@tanstack/react-start'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createRouter } from './router'
import { ErrorBoundary } from './components/ErrorBoundary'

const router = createRouter()

hydrateRoot(
  document,
  <StrictMode>
    <ErrorBoundary>
      <StartClient router={router} />
    </ErrorBoundary>
  </StrictMode>,
)
```

## Development vs Production

You may want different behavior in development vs production:

```tsx
// src/client.tsx
import { StartClient } from '@tanstack/react-start'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createRouter } from './router'

const router = createRouter()

const App = (
  <>
    {import.meta.env.DEV && <div>Development Mode</div>}
    <StartClient router={router} />
  </>
)

hydrateRoot(
  document,
  import.meta.env.DEV ? <StrictMode>{App}</StrictMode> : App,
)
```

The client entry point gives you full control over how your application initializes on the client side while working seamlessly with TanStack Start's server-side rendering.
