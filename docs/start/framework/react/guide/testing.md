---
id: testing
title: Testing
---

> **Experimental:** Start's support for test runners is experimental and subject to change. It works with Vitest 5.1.1 or later.

Start's Vite plugin compiles your code for the environment it runs in. In client code a server function becomes a request to the server, and an isomorphic function keeps its client implementation. Code that only the server uses is removed, together with its imports. Tests need the same compilation: without it, a client test imports your database client and every other module that only the server can load.

When Vitest loads a config that contains `tanstackStart()`, the plugin compiles your code as it does in the app. It leaves out the parts that serve or build the app, so a test run starts no dev server and needs no built output.

The examples on this page use React. `@tanstack/solid-start` and `@tanstack/vue-start` work the same way.

## Setup

Add `tanstackStart()` to the config your tests use. An app can use one `vite.config.ts` for the app and for its tests:

```ts title="vite.config.ts"
import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [tanstackStart(), react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          include: ['tests/**/*.client.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.server.test.ts'],
        },
      },
    ],
  },
})
```

The two projects and the file names are a convention of this example. A test file is compiled for the environment its project runs in.

A package that only uses Start's APIs, such as a shared library of server functions, uses the same config. In a test run the plugin does not ask for a router entry or for routes.

Start treats a run as a test run when Vitest resolves the config in its default mode, `test`. With another mode (`vitest --mode staging`) the plugin sets up the app's dev server as usual.

## Which code a test gets

| Test environment                                                        | Code the test gets |
| ----------------------------------------------------------------------- | ------------------ |
| [Browser mode](https://vitest.dev/guide/browser/), `jsdom`, `happy-dom` | Client             |
| `node`                                                                  | Server             |

Take a module with an isomorphic function whose server implementation reads a secret:

```ts title="src/runtime.ts"
import { createIsomorphicFn } from '@tanstack/react-start'
import { readSecret } from './secrets.server'

export const describeRuntime = createIsomorphicFn()
  .server(() => `server with ${readSecret()}`)
  .client(() => 'client')
```

In a client test `describeRuntime()` returns `'client'`, and `./secrets.server` is never loaded. In a server test it runs the server implementation.

`createServerOnlyFn` and `createClientOnlyFn` behave as in the app too: the function runs in its own environment and throws in the other one.

## Routes in a test run

A test can import a route file or the generated route tree.

The route tree is generated once, when Vitest starts, and only for a project that has a router entry and a routes directory. It is not regenerated while Vitest watches. After you add, move or delete a route file, restart Vitest.

A test run never writes to your route files. The dev server fills in an empty route file and corrects the path in a file you moved. A test run leaves both as they are and logs a warning.

In client code a route loses its `server`, `ssr` and `headers` options, as in the app. That holds for every module that calls `createFileRoute`, `createRootRoute` or `createRootRouteWithContext`, including one outside the routes directory.

## Server functions in client tests

A client test has no server, so a server function call in client code has no one to answer it. Replace the server function with a module mock. `importOriginal` keeps the other exports of the module:

```tsx title="tests/post-title.client.test.tsx"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { PostTitle } from '../src/components/PostTitle'
import { fetchPost } from '../src/posts'

vi.mock('../src/posts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/posts')>()),
  fetchPost: vi.fn(async ({ data }: { data: string }) => ({
    id: data,
    title: 'A mocked post',
  })),
}))

test('the title of the post comes from fetchPost', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PostTitle postId="42" />
    </QueryClientProvider>,
  )

  expect(await screen.findByText('A mocked post')).toBeTruthy()
  expect(fetchPost).toHaveBeenCalledWith({ data: '42' })
})
```

`importOriginal` loads the module as client code, so its server-only imports stay out of the test. A module mock only changes what other modules import: a call in the module that defines the server function still goes to the server function itself.

## Limits

- Vitest is the only supported test runner.
- The route tree is not regenerated while Vitest watches.
