/**
 * A Start dev server renders an edited route on the server: after an edit of
 * a route file, the page's server render (Start's dev middleware) shows what
 * the edited route does. Runs in a process of its own (`integration-alone`):
 * outside `NODE_ENV=development` (a test process sets `test`), router-core
 * keeps the first server router's processed route tree for the process, so
 * the first dev server of a process is the one that shows whether an edit
 * reaches it.
 */
import { describe, expect, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { startDevServer, startServerEntryFiles } from '../dev-server'

const timeout = 30_000

const files = {
  ...startServerEntryFiles,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
`,
}

/** `src/routes/page.tsx`: a route whose loader gives `mark`; `withServerFn`: the file defines a server fn too. */
const page = (mark: string, withServerFn: boolean) =>
  `import { createFileRoute } from '@tanstack/react-router'
${
  withServerFn
    ? `import { createServerFn } from '@tanstack/react-start'
export const read = createServerFn().handler(() => 'MARK_FN')
`
    : ''
}export const Route = createFileRoute('/page')({
  loader: () => '${mark}',
  component: Page,
})
function Page() {
  return <p>{Route.useLoaderData()}</p>
}
`

describe('Vite dev: the server render of an edited route', () => {
  test.each([
    // the server module of a file defining a server fn accepts its own hot
    // updates (Source: review 1, claim #7)
    { name: 'a route file defining a server fn', withServerFn: true },
    { name: 'a route file', withServerFn: false },
  ])(
    '$name: the server renders the edited loader',
    async ({ withServerFn }) => {
      const server = await startDevServer({
        start: {},
        listen: true,
        files: {
          ...files,
          'src/routes/page.tsx': page('MARK_LOADER_V1', withServerFn),
        },
      })
      expect((await server.fetch('/page')).body).toContain('MARK_LOADER_V1')
      await server.edit({
        'src/routes/page.tsx': page('MARK_LOADER_V2', withServerFn),
      })
      let last = ''
      await waitForOutcome({
        applied: async () =>
          (last = (await server.fetch('/page')).body).includes(
            'MARK_LOADER_V2',
          ),
        timeout: 5_000,
        describe: () => `the server render: ${last.slice(0, 300)}`,
      })
    },
    timeout,
  )
})
