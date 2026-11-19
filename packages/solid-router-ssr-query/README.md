<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://tanstack.com/api/readme/router.png?framework=solid&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://tanstack.com/api/readme/router.png?framework=solid"
  />
  <img
    src="https://tanstack.com/api/readme/router.png?framework=solid"
    alt="TanStack Solid Router"
    width="900"
  />
</picture>

# @tanstack/solid-router-ssr-query

> [!IMPORTANT]
> **Deprecated on the Solid v2 line.** Solid 2.0's native channels make this
> package's transport unnecessary: `QueryClientProvider` in
> `@tanstack/solid-query` v6 serializes the request's cache into Solid's
> hydration registry during SSR and primes the client cache from it — running
> this package alongside it ships every query payload twice. The two runtime
> conveniences it bundled are each a few lines of userland composition on
> public APIs (see the Solid Start e2e apps under `e2e/solid-start/`): wrap
> the router tree in `QueryClientProvider` via the router's `Wrap` option,
> and hand cache-driven `redirect()` errors to `router.navigate` from the
> caches' `config.onError`.

SSR query integration for TanStack Solid Router and TanStack Solid Query.

This package provides seamless integration between TanStack Router and TanStack Query for server-side rendering in Solid applications.

## Installation

```bash
npm install @tanstack/solid-router-ssr-query
# or
pnpm add @tanstack/solid-router-ssr-query
# or
yarn add @tanstack/solid-router-ssr-query
```

## Usage

```tsx
import { QueryClient } from '@tanstack/solid-query'
import { createRouter } from '@tanstack/solid-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/solid-router-ssr-query'

const queryClient = new QueryClient()
const router = createRouter({
  routeTree,
  context: { queryClient },
})

setupRouterSsrQueryIntegration({
  router,
  queryClient,
})
```

## License

MIT
