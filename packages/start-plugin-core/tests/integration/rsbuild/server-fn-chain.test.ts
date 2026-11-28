/**
 * An Rsbuild build of an RSC app whose page calls a chain of server fns,
 * each in a module of its own that only the previous one's handler
 * imports: each is found by building the one before (J4.2 "in any module
 * processing order"), however long the chain, and the page renders the
 * last one's value through all of them.
 * Source: the RSC phase 1 re-check 3 (/var/tmp/rsc-p1-recheck3/report.md
 * "Resolver removal, watch and other limits", `closure.py pure`: chains of
 * 9 and 12 built and answered 500 "Server function info not found" on
 * db260cf3a3 and 2169b4165c), design-rsc-phase1-settlement.md S4.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'

const root = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fn0 } from '../fn0'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await fn0() }),
  component: Home,
})
function Home() {
  return <main data-testid="value">{Route.useLoaderData().value}</main>
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}

/** `fn<i>.ts` for each of the `n` links: each handler prefixes the next one's value, the last returns `DEEP_VALUE`. */
function chain(n: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const last = i === n - 1
    out[`src/fn${i}.ts`] =
      `${last ? '' : `import { fn${i + 1} as next } from './fn${i + 1}'\n`}import { createServerFn } from '@tanstack/react-start'
export const fn${i} = createServerFn().handler(${last ? `() => 'DEEP_VALUE'` : `async () => 'L${i} ' + (await next())`})
`
  }
  return out
}

describe('Rsbuild build with RSC, a chain of server fns each only the previous one imports', () => {
  test.each([9, 12])(
    '%i links: the page renders the last value through all of them',
    async (n) => {
      const built = await buildStart({
        bundler: 'rsbuild',
        files: { ...root, ...chain(n) },
        entry: 'src/entry.ts',
        symlinks: rsbuildRscLinks(),
        start: { rsc: { enabled: true } } as never,
      })
      const { url } = await built.preview()
      const response = await fetch(new URL('/', url))
      const html = await response.text()
      expect({
        status: response.status,
        value: /data-testid="value">([^<]*)</.exec(html)?.[1],
      }).toEqual({
        status: 200,
        value: [
          ...Array.from({ length: n - 1 }, (_, i) => `L${i}`),
          'DEEP_VALUE',
        ].join(' '),
      })
    },
  )
})
