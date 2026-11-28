---
id: testing
title: Testing
---

> **Experimental:** Start's support for test runners is experimental and subject to change. It works with Vitest 5.1.1 or later.

Start's Vite plugin compiles your code for the environment it runs in. In client code a server function becomes a request to the server, and an isomorphic function keeps its client implementation. Code that only the server uses is removed, together with its imports. Tests need the same compilation: without it, a client test imports your database client and every other module that only the server can load.

When Vitest loads a config that contains `tanstackStart()`, the plugin compiles your code as it does in the app. It leaves out the parts that serve or build the app, so a test run starts no dev server and needs no built output.

The examples on this page use React. `@tanstack/solid-start` and `@tanstack/vue-start` export the same functions from the same subpaths.

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

## Mocking server functions in client tests

A client test has no server. When client code calls a server function in a test run, no request is sent. The call goes to a mock that the test registered for that function with `mockServerFn`.

Take a route whose loader gets a post from a server function:

```ts title="src/posts.ts"
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { findPost } from './db.server'

export const fetchPost = createServerFn()
  .validator((postId: string) => postId)
  .handler(async ({ data }) => {
    const post = await findPost(data)
    if (!post) {
      throw notFound()
    }
    return post
  })
```

```tsx title="src/routes/posts.$postId.tsx"
import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost({ data: params.postId }),
  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()

  return <h1>{post.title}</h1>
}
```

The test renders the route. The mock answers the loader's call in place of the server:

```tsx title="tests/post-page.client.test.tsx"
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { mockServerFn } from '@tanstack/react-start/testing'
import { afterEach, expect, test } from 'vitest'
import { fetchPost } from '../src/posts'
import { routeTree } from '../src/routeTree.gen'

afterEach(() => {
  cleanup()
})

test('the post page shows the title of the post', async () => {
  mockServerFn(fetchPost, ({ data }) => ({
    id: data,
    title: 'Testing with TanStack Start',
  }))
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/posts/42'] }),
  })

  render(<RouterProvider router={router} />)

  expect((await screen.findByRole('heading')).textContent).toBe(
    'Testing with TanStack Start',
  )
})
```

The mock stands for the server side of the function: its server middleware, its validator and its handler. It is called where the app would send the request, so the function's client middleware runs as in the app, before the mock and after it.

A mock also answers a call that is made in the module that defines the server function. A module mock (`vi.mock`) cannot replace such a call, because it only changes what other modules import.

A call to a server function that has no mock fails with an error that names the function:

```
The server function "fetchPost" (/src/posts.ts) was called in a client test, where no server runs. Answer the call with mockServerFn() before it is made.
```

### `mockServerFn(serverFn, mock)`

Registers `mock` as the answer to every call of `serverFn`. A mock that a test registers ends with that test, see [How long a mock lasts](#how-long-a-mock-lasts). A second call for the same function in the same test replaces the first mock, and a mock of the test takes precedence over one of the file.

The test context has a `mockServerFn` and a `resetServerFnMocks` too: `test('...', ({ mockServerFn, resetServerFnMocks }) => { ... })`. They do the same and belong to that test in every environment, which matters for [tests that run concurrently](#tests-that-run-concurrently) in browser mode. TypeScript knows it once a file of the project imports from `@tanstack/react-start/testing`; a project that only uses the context's version adds `import type {} from '@tanstack/react-start/testing'` to a file its tests include.

`mock` is typed from the server function. It gets one object:

| Property  | Type                       | Value                                                                          |
| --------- | -------------------------- | ------------------------------------------------------------------------------ |
| `data`    | The function's input       | The `data` of the call, as the caller passed it. The validator has not run.    |
| `method`  | `'GET' \| 'POST'`          | The method of the server function.                                             |
| `headers` | `Headers`                  | The headers of the call, with the ones the function's client middleware added. |
| `signal`  | `AbortSignal \| undefined` | The signal of the call.                                                        |

`mock` returns what the call resolves to, or a promise for it. The return type is the handler's return type, literal types included: a mock of a handler that returns `{ status: 'ok' }` has to return exactly that. The value reaches the caller as it is. It is not passed through the serializer, so the test does not notice a value that the server could not send, such as a function.

What `mock` throws rejects the call. To test how your code handles a redirect or a failed call, throw `redirect(...)` or an error in the mock.

To check how a server function was called, pass a mock function of your test runner. Take a button that likes a post. `likePost` is a server function that takes the id of a post and returns its new number of likes:

```tsx title="src/components/LikeButton.tsx"
import { useState } from 'react'
import { likePost } from '../posts'

export function LikeButton({ postId }: { postId: string }) {
  const [likes, setLikes] = useState<number>()

  return (
    <button onClick={async () => setLikes(await likePost({ data: postId }))}>
      {likes === undefined ? 'Like' : `${likes} likes`}
    </button>
  )
}
```

```tsx title="tests/like-button.client.test.tsx"
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockServerFn } from '@tanstack/react-start/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { LikeButton } from '../src/components/LikeButton'
import { likePost } from '../src/posts'

afterEach(() => {
  cleanup()
})

test('likes the post and shows the new count', async () => {
  const like = vi.fn(() => 5)
  mockServerFn(likePost, like)
  render(<LikeButton postId="42" />)

  fireEvent.click(screen.getByRole('button', { name: 'Like' }))

  expect(await screen.findByRole('button', { name: '5 likes' })).toBeDefined()
  expect(like).toHaveBeenCalledWith(expect.objectContaining({ data: '42' }))
})
```

`mockServerFn` works in client tests only. In a server test it throws, because the function was not compiled for the client. A server test runs the function itself, as the next section shows.

### `resetServerFnMocks()`

Removes the mocks that `mockServerFn` registered: the ones of the running test when it is called in a test, the ones of the file otherwise. Start ends the mocks of a test when the test ends, so most tests never call it.

## Testing server functions and middleware in server tests

In a server test your code runs as it does on the server, and a server function runs in full: its middleware, its validator and its handler. The helpers for server tests come from `@tanstack/react-start/testing/server`.

### Calling a server function

On the server, a server function runs for a request. It reads the cookies of that request, sets headers on the response, and gets context from the middleware that ran before it. A server function that a test calls outside of a request fails:

```
No Start context found in AsyncLocalStorage. Make sure you are using the function within the server runtime. In a test, run this code inside runInRequest(), which the testing/server entry of your Start package exports (for example '@tanstack/react-start/testing/server').
```

`runInRequest` runs a callback as the code that handles one request to your server. Take `fetchPost` and `likePost` from above. `likePost` uses a middleware that finds the user of the session cookie:

```ts title="src/middleware/auth.ts"
import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { findUserBySession } from '../db.server'

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const user = await findUserBySession(getCookie('session'))
    if (!user) {
      throw new Error('Not signed in')
    }
    return next({ context: { user } })
  },
)
```

```ts title="src/posts.ts"
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { addLike } from './db.server'
import { authMiddleware } from './middleware/auth'

export const likePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((postId: string) => postId)
  .handler(async ({ data, context }) => {
    setResponseHeader('cache-control', 'no-store')
    // Counts each user once and returns the number of likes.
    return addLike(data, context.user.id)
  })
```

```ts title="tests/posts.server.test.ts"
import { getResponseHeader } from '@tanstack/react-start/server'
import { runInRequest } from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { fetchPost, likePost } from '../src/posts'

test('fetchPost returns the post', async () => {
  const post = await runInRequest(() => fetchPost({ data: '1' }))

  expect(post.title).toBe('The first post')
})

test('fetchPost fails for a post that does not exist', async () => {
  await expect(
    runInRequest(() => fetchPost({ data: 'unknown' })),
  ).rejects.toMatchObject({ isNotFound: true })
})

test('likePost counts a user once', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    expect(await likePost({ data: '1' })).toBe(1)
    expect(await likePost({ data: '1' })).toBe(1)

    expect(getResponseHeader('cache-control')).toBe('no-store')
  })
})

test('likePost refuses a request without a session', async () => {
  await expect(runInRequest(() => likePost({ data: '1' }))).rejects.toThrow(
    'Not signed in',
  )
})
```

The handlers in these tests use the real `./db.server`. A server test loads your server code as it is, so the test has to provide the data that code reads, for example a test database with a post `1` and a session `ada`.

Each server function call inside the callback runs like a call that a loader makes while the server renders a page. The middleware of the function runs, client functions first and server functions after them, then the validator and the handler. The data and the result are passed as they are and do not go through the serializer.

Start's request and response helpers work inside the callback: `getRequest`, `getCookie`, `setResponseHeader`, `getResponseHeader` and the other functions of `@tanstack/react-start/server`. A test can call several server functions in one request and check the response between the calls, as the third test does.

### `runInRequest(options, callback)`

Runs `callback` for one request. It resolves to what the callback returns and rejects with what the callback throws. `options` can be left out: `runInRequest(callback)`.

| Option             | Type                 | Value                                                                                                                   |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `url`              | `string \| URL`      | The URL of the request. A relative URL is resolved against `http://localhost`. The default is `/`.                      |
| `method`           | `string`             | The method of the request. The default is `GET`.                                                                        |
| `headers`          | `HeadersInit`        | The headers of the request. Cookies go into the `cookie` header.                                                        |
| `request`          | `Request`            | A request that is used as it is. It takes the place of `url`, `method` and `headers`.                                   |
| `context`          | Your request context | The context your server entry passes to Start with a request. It is required when your app registers a request context. |
| `globalMiddleware` | `'skip'`             | Leaves out the middleware of `src/start.ts`. [Global middleware](#global-middleware) describes it.                      |

The request counts as a request for a page. Request middleware gets `handlerType: 'router'`, so a middleware that only acts on server function requests lets it through. The CSRF middleware in its usual setup is one of them.

`getRouterInstance()` returns the router of your router entry, at the URL of the request.

### Global middleware

`runInRequest` runs the request middleware of `src/start.ts` before the callback, and the function middleware of `src/start.ts` with each server function call. Take an app whose request middleware reads the language of the request:

```ts title="src/start.ts"
import { createMiddleware, createStart } from '@tanstack/react-start'

type Locale = 'en' | 'de'

const localeMiddleware = createMiddleware().server(({ next, request }) => {
  const locale: Locale = request.headers
    .get('accept-language')
    ?.startsWith('de')
    ? 'de'
    : 'en'
  return next({ context: { locale } })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware],
}))
```

If the handler of `fetchPost` looks the post up with `findPost(data, context.locale)`, a test chooses the language with a header:

```ts
test('fetchPost returns the post in the language of the request', async () => {
  const post = await runInRequest(
    { headers: { 'accept-language': 'de-DE' } },
    () => fetchPost({ data: '1' }),
  )

  expect(post.title).toBe('Der erste Beitrag')
})
```

When a request middleware answers the request itself or throws, the callback does not run and `runInRequest` rejects. It rejects with what the middleware threw, or with an error that has the middleware's response as its `cause`.

To keep the global middleware out of a test, pass `globalMiddleware: 'skip'`. Neither list of `src/start.ts` runs then. `context` takes the place of the context the two lists pass on:

```ts
test('fetchPost returns the English post', async () => {
  const post = await runInRequest(
    { globalMiddleware: 'skip', context: { locale: 'en' } },
    () => fetchPost({ data: '1' }),
  )

  expect(post.title).toBe('The first post')
})
```

The type of `context` comes from your start instance. TypeScript reports a missing property and a value the middleware could not have produced, such as `locale: 'fr'` here. The option needs no reference to a middleware, so it also works for middleware that `src/start.ts` does not export. A server function that lists one of the global middleware itself still runs it.

### `mockMiddleware(middleware, mock)`

Replaces a middleware in server tests. `likePost` needs a session, and the test below puts a user in its place:

```ts title="tests/posts.server.test.ts"
import {
  mockMiddleware,
  runInRequest,
} from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { authMiddleware } from '../src/middleware/auth'
import { likePost } from '../src/posts'

test('likePost counts the like of a user', async () => {
  mockMiddleware(authMiddleware, ({ next }) =>
    next({ context: { user: { id: 'u2', name: 'Grace' } } }),
  )

  await expect(runInRequest(() => likePost({ data: '2' }))).resolves.toBe(1)
})
```

`mock` stands for the server function of the middleware and is typed from it. It gets what that function gets: `data`, `context`, `method`, `serverFnMeta` and `next` for a function middleware, and `request`, `pathname`, `context`, `handlerType` and `next` for a request middleware. The signal of the request is `getRequest().signal`, as in the middleware.

A mock goes on with the call by returning `next()`. When the middleware passes context on, `next` requires that context, because the code after the middleware reads it. A mock can also end the call the way the middleware can: by throwing, or by returning a `Response` in the mock of a request middleware.

While a middleware is mocked, its client function does not run either. A server test would otherwise run that function in Node, where code written for a browser can fail. So the `context` of the mock has nothing that this client function sends to the server, and TypeScript leaves it out of the type.

A mock registered inside the callback of `runInRequest` belongs to that request. It takes precedence over a mock of the test, and it ends with the request. If nothing in the request ran it, `runInRequest` rejects, because a mock that never runs usually means the test does not exercise what it was written for.

The request middleware of `src/start.ts` has already run when the callback starts. Mock one of them before you call `runInRequest`.

`mockMiddleware` replaces one middleware object. On the server, Start loads the file of a server function a second time, for the server side of the function. A middleware that is created in that file therefore exists twice, and a mock reaches only one of the two. Create a middleware that tests replace in a file of its own, like `src/middleware/auth.ts` above.

### `runMiddleware(middleware, input, next)`

Calls the server function of one middleware and nothing else. The middleware that it lists itself does not run, and neither does its validator or its client function. Call it inside `runInRequest`, which provides the request.

```ts title="tests/auth.server.test.ts"
import {
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { authMiddleware } from '../src/middleware/auth'

test('authMiddleware passes the user of the session on', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    const { context } = await runMiddleware(authMiddleware, {})

    expect(context.user).toEqual({ id: 'u1', name: 'Ada' })
  })
})

test('authMiddleware refuses a request without a session', async () => {
  await runInRequest(async () => {
    await expect(runMiddleware(authMiddleware, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})
```

`input` is what the server function of the middleware receives. Its type comes from the middleware.

| Property       | For                 | Value                                                                                                              |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data`         | Function middleware | The validated data. It is required when the middleware or a middleware it lists has a validator.                   |
| `context`      | Both                | The context of the middleware that runs before this one. It is required when that context has a required property. |
| `method`       | Function middleware | The method of the server function. The default is `GET`.                                                           |
| `handlerType`  | Request middleware  | `'router'` for a page request, `'serverFn'` for a server function request. The default is `'router'`.              |
| `serverFnMeta` | Both                | The id, the name and the file of the server function that the call is for.                                         |

`next` is optional. It stands for everything that runs after the middleware, and it gets what the middleware passed on. For a function middleware it gets `context` and `sendContext`, and what it returns is the result of the call. For a request middleware it gets `context`, `request` and `pathname`, and it returns the `Response` of the request. Without it, the response is an empty one with status 200.

`runMiddleware` resolves to an object:

| Property      | For                 | Value                                                                                           |
| ------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `context`     | Both                | The context after the middleware: what it received and what it added.                           |
| `sendContext` | Function middleware | The context the middleware sends back to the client.                                            |
| `result`      | Function middleware | What `next` returned.                                                                           |
| `response`    | Request middleware  | The response the middleware answers the request with: its own, or the one that `next` returned. |

A request middleware often changes the response of the request. Take a middleware that derives a tenant from the host name:

```ts title="src/middleware/tenant.ts"
import { createMiddleware } from '@tanstack/react-start'

export const tenantMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const tenant = new URL(request.url).hostname.split('.')[0]!
    if (tenant === 'www') {
      return new Response('No tenant', { status: 404 })
    }
    const result = await next({ context: { tenant } })
    result.response.headers.set('x-tenant', tenant)
    return result
  },
)
```

```ts title="tests/tenant.server.test.ts"
import {
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'
import { expect, test, vi } from 'vitest'
import { tenantMiddleware } from '../src/middleware/tenant'

test('tenantMiddleware names the tenant in the context and in a header', async () => {
  await runInRequest({ url: 'https://acme.example.com/posts' }, async () => {
    const { context, response } = await runMiddleware(
      tenantMiddleware,
      {},
      ({ context }) => new Response(`Posts of ${context.tenant}`),
    )

    expect(context).toEqual({ tenant: 'acme' })
    expect(response.headers.get('x-tenant')).toBe('acme')
    await expect(response.text()).resolves.toBe('Posts of acme')
  })
})

test('tenantMiddleware answers a request without a tenant itself', async () => {
  await runInRequest({ url: 'https://www.example.com/posts' }, async () => {
    const next = vi.fn()
    const { response } = await runMiddleware(tenantMiddleware, {}, next)

    expect(response.status).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })
})
```

A `Response` that a request middleware throws counts as its answer, as in the app, so `response` holds it. What a function middleware throws rejects the call.

If `tenantMiddleware` is listed in `src/start.ts`, `runInRequest` also runs it for the request of the test, before the callback. For the second test that run would end the request. Such a test passes `globalMiddleware: 'skip'`.

`runMiddleware` calls the real server function of a middleware, also while `mockMiddleware` replaces that middleware.

## How long a mock lasts

Start's plugin adds a setup file to every Vitest project. The file ends a mock of `mockServerFn` or `mockMiddleware` together with the test that registered it:

- A mock registered in a test, or in a `beforeEach` hook, lasts until that test ends.
- A mock registered at the top of a test file, or in a `beforeAll` hook, lasts for the whole file.
- A mock registered with `mockMiddleware` inside the callback of `runInRequest` lasts until that request ends.

### Tests that run concurrently

Tests in one file that run at the same time (`test.concurrent`) keep their mocks apart. When one of them ends, only its own mocks end.

Which mock answers a call depends on whether the test environment can tell the tests apart while code runs:

- In jsdom, happy-dom and Node, Start runs each test in its own async context. A call that code of a test makes gets the mock of that test, also when other tests mock the same function in a different way.
- In browser mode there is no async context. Register and reset mocks through the test context there: `test.concurrent('...', async ({ mockServerFn, resetServerFnMocks }) => { ... })`. A mock then ends with its own test, and a reset removes only the mocks of its own test. When two concurrent tests mock the same server function, the mock registered last answers the calls of both. Put such tests in separate files, which Vitest keeps apart, or let them run one after another.

Work that a test starts and does not wait for can register a mock after the test has ended. That throws an error that says so: wait inside the test for that work.

Code that runs for a test but was started outside it loses the test's context: an event that another test dispatches, for example. Concurrent tests also share one `document` in jsdom, so each test should query only the elements it rendered, as with `within(container)`.

The request middleware of `src/start.ts` has already run when the callback of `runInRequest` starts, so a mock registered there cannot replace it. A test that needs other behaviour from it registers the mock before `runInRequest`, or passes `globalMiddleware: 'skip'` with the `context` it needs.

## Limits

- Vitest is the only supported test runner.
- `runInRequest` sends no HTTP request. A server function call inside it skips the serializer, and a test cannot call a server route through it.
- A test cannot call the handler of a server function without its middleware and its validator. To take a middleware out of the way, replace it with `mockMiddleware`.
- `mockMiddleware` cannot replace a middleware that is created in the same file as a server function that uses it.
- The route tree is not regenerated while Vitest watches.
