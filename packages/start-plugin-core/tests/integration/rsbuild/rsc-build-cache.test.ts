/**
 * Rsbuild's persistent cache (`performance.buildCache`) in an RSC build,
 * whose server environment compiles a file both layers import as a module
 * of each (SSR: what routes render; RSC: what server fns run). A build
 * after an edit compiles one layer's module of a file again, and the other
 * layer's restored module of that file is still checked against the files
 * its compile read.
 * Source: research (the RSC layer's compile of `fns.ts` made the SSR layer's
 * restored module count as compiled, so it kept the previous build's
 * uncompiled `base.handler(…)` after `base` became a server fn builder: the
 * page failed with a 500; main serves it).
 */
import { expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'
import type { StartPluginOptions } from '../../start-plugins'

/** `@tanstack/react-start`'s RSC option (not one of every framework's Start config). */
const rscEnabled: StartPluginOptions = { rsc: { enabled: true } }

const plainBase = `export const base = {
  handler: (fn: () => Promise<string>) => fn,
}
`
const builderBase = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

/** `helper.ts`, which only `getUc`'s handler imports (the RSC layer). */
function helper(importsFns: boolean): string {
  return importsFns
    ? `import { fromBase } from './fns'
export const h = async () => 'H' + String(await fromBase())
`
    : `export const h = async () => 'H'
`
}

/**
 * The route at `/` imports `fns.ts` (the SSR layer's module) and calls the
 * server fn `getUc`, whose handler calls `helper.ts`'s `h`.
 */
const files = {
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
  'src/utils/base.ts': plainBase,
  'src/utils/fns.ts': `import { base } from './base'
export const fromBase = base.handler(async () => 'MARK_FROM_BASE')
`,
  'src/utils/helper.ts': helper(false),
  'src/utils/ucServer.ts': `import { createServerFn } from '@tanstack/react-start'
import { h } from './helper'
export const getUc = createServerFn({ method: 'GET' }).handler(
  async () => 'UC:' + (await h()),
)
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { fromBase } from '~/utils/fns'
import { getUc } from '~/utils/ucServer'
export const Route = createFileRoute('/')({
  loader: async () => ({ a: String(await fromBase()), b: await getUc() }),
  component: Index,
})
function Index() {
  const data = Route.useLoaderData()
  return (
    <main>
      {data.a}|{data.b}
    </main>
  )
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: { jsx: 'react-jsx', paths: { '~/*': ['./src/*'] } },
  }),
}

// One change set (a pull, a branch switch): `base` became a server fn
// builder, and the RSC layer's `helper.ts` newly imports `fns.ts`, whose
// SSR layer module the cache restores.
test("a layer's module restored from the cache is compiled again when what it imports changed, while the other layer compiles the file", async () => {
  const cold = await buildStart({
    bundler: 'rsbuild',
    files,
    entry: 'src/entry.ts',
    symlinks: rsbuildRscLinks(),
    start: rscEnabled,
    rsbuildConfig: { performance: { buildCache: true } },
  })
  const warm = await cold.rebuild({
    'src/utils/base.ts': builderBase,
    'src/utils/helper.ts': helper(true),
  })
  const { url } = await warm.preview()
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect((await response.text()).replace(/<!-- -->/g, '')).toContain(
    'MARK_FROM_BASE|UC:HMARK_FROM_BASE',
  )
})
