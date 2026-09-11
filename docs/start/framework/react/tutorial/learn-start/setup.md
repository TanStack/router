---
id: learn-start-setup
title: Learn Start, Set Up the App
description: Run a small TanStack Start app and understand the router, root document, server HTML, and first route.
---

Build Field notes, an app for writing and sharing what you learn. This first checkpoint has one route and no database. Later chapters add URLs, storage, forms, accounts, metadata, deployment, and tests to the same app.

## Run the first checkpoint

You need Node.js and pnpm. Clone the [TanStack Router repository](https://github.com/TanStack/router) and complete its [dependency and framework build setup](https://github.com/TanStack/router/blob/main/CONTRIBUTING.md). The course checkpoints use the framework packages in that checkout so the code and APIs stay together.

```sh
cd examples/react/start-learn
pnpm dev
```

Open http://localhost:3140. You should see **Field notes** and **Keep a record of what you learn.** The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/01-setup) is in `checkpoints/01-setup`. Each checkpoint has its own source directory and Vite configuration; the course directory supplies their shared dependencies.

## Follow a request through the app

`src/router.tsx` creates the router from the generated route tree:

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({ routeTree })
}
```

Start calls `getRouter` for an incoming server-rendered request and creates a router for the browser. Keep request-specific state inside that lifecycle. Do not edit `routeTree.gen.ts`; the route plugin generates it from your route files.

`src/routes/__root.tsx` supplies the HTML document. `HeadContent` renders the route metadata, and `Scripts` loads the client code. Both belong in the document:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Field notes | Learn Start' },
    ],
  }),
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main>
      <h1>Note not found</h1>
      <a href="/">All notes</a>
    </main>
  ),
})
```

The checkpoint's root route supplies that component through `shellComponent`. Its `head` option sets the character encoding, viewport, and page title. Its not-found component will also provide a recovery page when the next chapter adds note URLs.

Finally, `src/routes/index.tsx` matches `/`:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>Field notes</h1>
      <p>Keep a record of what you learn.</p>
    </main>
  )
}
```

Change the paragraph and watch the page update. There is no manual route registration: the file generates the route entry.

## Check the server response

With the development server running:

```sh
curl http://localhost:3140/
```

The response should contain the paragraph you just edited, not only an empty root element. Browser source inspection shows the same distinction. This verifies server-rendered content; it does not by itself prove every client interaction works.

Stop the development server before running the checkpoint test, because the test starts its own server:

```sh
pnpm exec playwright install chromium
COURSE_CHECKPOINT=01-setup pnpm test:e2e
```

The test requests the raw HTML and opens the page in a browser. If the page is empty, inspect the terminal first, then check `HeadContent`, `Scripts`, and the generated route tree against the checkpoint.

Next: [Give notes their own URLs](./routes).
