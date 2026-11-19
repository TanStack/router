---
title: How to Test Router with File-Based Routing
---

This guide covers testing TanStack Router applications that use file-based
routing with a real router instance and memory history instead of mocks.

## Philosophy

Test the navigation behaviour users experience, not implementation details.
When a user clicks a link, verify they actually reach the destination — don't
just check that a function was called. Using a real `createRouter()` with
`createMemoryHistory()` gives you higher confidence, keeps full type safety
with no mock types, and catches route configuration errors. Only mock
navigation for external URLs or when asserting that navigation is blocked.

## Prerequisites

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

If you haven't configured Vitest yet, create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
    },
})
```

with `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

No router plugin is needed in the Vitest config for tests to run — test
execution only imports the already-generated `routeTree.gen.ts`. Just make
sure that file exists before tests run: run your dev server or build once.

## Create the test fixture

Create `src/test/router-test-utils.tsx`. This is the only setup you need —
every example below uses it:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    RouterProvider,
    createMemoryHistory,
    createRouter,
} from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

export async function renderWithRouter(initialPath = '/') {
    const router = createRouter({
        routeTree,
        history: createMemoryHistory({
            initialEntries: [initialPath],
        }),
        // The default pending delays (500ms+) make every test slow.
        // Always disable them in tests.
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
    })

    // The initial load is async. Always await it before asserting,
    // otherwise assertions race the router.
    await router.load()

    const user = userEvent.setup()

    // Render the provider itself — it renders the matched route.
    // Do NOT pass your UI as `children`: RouterProvider ignores children.
    render(<RouterProvider router={router} />)

    return { router, user, screen, waitFor }
}
```

Rules for every test:

1. Create a fresh router (and history) per test — never share router state.
2. Always `await router.load()` before rendering (handled by the fixture).
3. Always await navigation with `waitFor` or `findBy*` queries.
4. Assert both router state (`router.state.location`) and rendered content.

## Example routes used below

The examples assume this file layout — adapt the paths and text to your app:

```text
src/routes/__root.tsx          # renders <Outlet />
src/routes/index.tsx           # "Welcome Home!" + <Link to="/about">About</Link>
src/routes/about.tsx           # "About"
src/routes/posts/index.tsx     # post list with loader + links to /posts/$postId
src/routes/posts/$postId.tsx   # reads params via Route.useParams()
src/routes/search.tsx          # validateSearch for `q` and `page`
src/routes/dashboard.tsx       # beforeLoad auth guard using router context
```

The `search.tsx` route validates its search params:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
    validateSearch: (search: Record<string, unknown>) => ({
        q: (search.q as string | undefined) ?? '',
        page: Number(search.page ?? 1),
    }),
    component: SearchPage,
})
```

The `dashboard.tsx` route guards access with `beforeLoad`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
    beforeLoad: ({ context }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({ to: '/login' })
        }
    },
    component: DashboardPage,
})
```

## Test rendering a route

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

describe('Home route', () => {
    it('renders the index route at /', async () => {
        const { router, screen } = await renderWithRouter('/')

        expect(router.state.location.pathname).toBe('/')
        expect(screen.getByText('Welcome Home!')).toBeTruthy()
    })
})
```

## Test Link navigation

Click the real link, then wait for the real navigation. Assert the router
state and the destination content:

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

describe('Navigation', () => {
    it('navigates to /about when the About link is clicked', async () => {
        const { router, screen, user, waitFor } = await renderWithRouter('/')

        await user.click(screen.getByRole('link', { name: 'About' }))

        await waitFor(() => {
            expect(router.state.location.pathname).toBe('/about')
        })
        expect(screen.getByText('About')).toBeTruthy()
    })
})
```

## Test dynamic path params

Start directly at the parameterized URL. Import the actual file route (or use
`getRouteApi`) for typed access — never reference an undefined `Route`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

describe('Post route', () => {
    it('parses the postId param from the URL', async () => {
        const { router, screen } = await renderWithRouter('/posts/123')

        // Params live on the matched routes, not on location.
        expect(router.state.matches.at(-1)?.params).toMatchObject({
            postId: '123',
        })
        expect(screen.getByText(/Post 123/)).toBeTruthy()
    })
})
```

## Test search params

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

describe('Search route', () => {
    it('validates and parses search params', async () => {
        const { router, screen } = await renderWithRouter(
            '/search?q=router&page=2',
        )

        expect(router.state.location.search).toMatchObject({
            q: 'router',
            page: 2,
        })
        expect(screen.getByDisplayValue('router')).toBeTruthy()
    })
})
```

## Test programmatic navigation

Drive navigation through the real router. For UI-triggered navigation, click
the actual button in your route. For state-level checks, `router.navigate`
is itself real navigation — await it:

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

describe('Programmatic navigation', () => {
    it('navigates via router.navigate', async () => {
        const { router, screen, waitFor } = await renderWithRouter('/')

        await router.navigate({ to: '/about' })

        await waitFor(() => {
            expect(router.state.location.pathname).toBe('/about')
        })
        expect(screen.getByText('About')).toBeTruthy()
    })

    it('navigates with search params', async () => {
        const { router, waitFor } = await renderWithRouter('/search')

        await router.navigate({
            to: '/search',
            search: { q: 'router', page: 2 },
        })

        await waitFor(() => {
            expect(router.state.location.search).toMatchObject({ q: 'router' })
        })
    })
})
```

## Test route guards

Apps whose root route declares a context (e.g. auth state) pass it at router
creation. Extend the fixture with a context parameter typed from your root
route:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    RouterProvider,
    createMemoryHistory,
    createRouter,
} from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'
import type { MyRouterContext } from '../routes/__root'

export async function renderWithRouterContext(
    initialPath = '/',
    context: MyRouterContext,
) {
    const router = createRouter({
        routeTree,
        history: createMemoryHistory({
            initialEntries: [initialPath],
        }),
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
        context,
    })
    await router.load()

    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    return { router, user, screen, waitFor }
}
```

Then test both sides of the guard:

```tsx
import { describe, expect, it } from 'vitest'
import { renderWithRouterContext } from '../test/router-test-utils'

describe('Dashboard guard', () => {
    it('redirects unauthenticated users to /login', async () => {
        const { router, screen, waitFor } = await renderWithRouterContext(
            '/dashboard',
            { auth: { isAuthenticated: false } },
        )

        await waitFor(() => {
            expect(router.state.location.pathname).toBe('/login')
        })
        expect(screen.getByText(/Please log in/)).toBeTruthy()
    })

    it('renders the dashboard for authenticated users', async () => {
        const { screen } = await renderWithRouterContext('/dashboard', {
            auth: { isAuthenticated: true },
        })

        expect(screen.getByText(/Welcome to Dashboard/)).toBeTruthy()
    })
})
```

## Test loaders

Stub data at the network boundary (`fetch`), never the route module or the
router. Set up the stub in `beforeEach` — not inside `it` — so every test is
isolated:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '../test/router-test-utils'

const posts = [{ id: '1', title: 'Hello Router' }]

beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => posts,
        }),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('Posts route loader', () => {
    it('renders loaded posts', async () => {
        const { screen } = await renderWithRouter('/posts')

        expect(await screen.findByText('Hello Router')).toBeTruthy()
    })

    it('renders the error component when loading fails', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Post not found'))

        const { screen } = await renderWithRouter('/posts')

        expect(await screen.findByText(/Post not found/)).toBeTruthy()
    })
})
```

## Test route tree generation

Assert against `router.routesById`, which reflects the real generated tree.
Do not walk `routeTree.children` — that is not the shape of the generated
tree:

```tsx
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { routeTree } from '../routeTree.gen'

describe('Generated route tree', () => {
    it('contains the expected file-based routes', () => {
        const router = createRouter({
            routeTree,
            history: createMemoryHistory({ initialEntries: ['/'] }),
        })
        const routeIds = Object.keys(router.routesById)

        expect(routeIds).toContain('/')
        expect(routeIds).toContain('/about')
        expect(routeIds).toContain('/posts/$postId')
    })
})
```

## Common pitfalls

1. **Don't mock the router.** Mocking `Link`, `useNavigate`, or `Outlet`
   gives false confidence. Use the real router.
2. **Don't pass UI as `children` of `RouterProvider`.** It renders the matched
   route, not children. `render(<RouterProvider router={router} />)`.
3. **Always `await router.load()`** before asserting.
4. **Always await navigation** with `waitFor`/`findBy*` — router updates are
   async.
5. **Set `defaultPendingMs: 0` and `defaultPendingMinMs: 0`** or every test
   pays the pending delay.
6. **Read params from `router.state.matches`**, not `location` — location
   only carries `pathname`, `search`, and `hash`.

## Troubleshooting

**Blank screen with "state update" warnings:** you rendered before the router
finished loading. Use the fixture above — it awaits `router.load()`.

**Slow tests:** check `defaultPendingMinMs: 0` is set on the test router.

**`Cannot find module '../routeTree.gen'`:** generate the route tree first
(run the dev server or build once) and keep the router plugin enabled in your
Vitest config.

**Type errors on `context`:** type the fixture parameter from your root
route's context (`createRootRouteWithContext<MyContext>`), as shown in the
guards section.

## Next Steps

- [How to Set Up Testing with Code-Based Routing](./setup-testing.md) -
  Testing patterns for manually defined routes
- [How to Debug Router Issues](./debug-router-issues.md) - Debug routing
  issues
- [File-Based Routing Guide](../routing/file-based-routing.md) - Learn more
  about file-based routing
