/**
 * The route modules `main` shares names in are the text Start leaves: on
 * the client a server fn's handler is erased, so what only a handler and
 * the split component read is the component's, in its lazy chunk (Vite and
 * Rsbuild builds, Start's whole plugin).
 * Source: coverage review E, finding 1 (`consistent.tsx` of the
 * server-functions e2e apps: the shared module and the entry held the inner
 * server fn, +65 B and +84 B eager against main).
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { closeAfterAll } from '../file-end'
import {
  buildStartShared,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

const files = {
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/consistent.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export const Route = createFileRoute('/consistent')({
  component: Page,
  loader: async () => outerFn({ data: { username: 'TEST' } }),
})
const innerFn = createServerFn()
  .validator((d: { username: string }) => d)
  .handler(({ data }) => ({ payload: data }))
const outerFn = createServerFn()
  .validator((d: { username: string }) => d)
  .handler(async ({ data }) => innerFn({ data }))
function Page() {
  return (
    <button onClick={() => innerFn({ data: { username: 'TEST' } })}>
      {typeof outerFn}
    </button>
  )
}
`,
  'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'src/entry.ts': `export { getRouter } from './router'\n`,
  'src/ssr-entry.ts': `export * from './entry'\n${callByIdExports}`,
}

/** Ids a test can find in the output (Start's public `generateFunctionId`). */
const idOf = ({ functionName }: { functionName: string }) =>
  `id-${functionName}`
const innerId = 'id-innerFn_createServerFn_handler'
const outerId = 'id-outerFn_createServerFn_handler'

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild

  const openBuild = closeAfterAll()
  beforeAll(async () => {
    build = await openBuild(() =>
      buildStartShared({
        bundler,
        files,
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: idOf } },
      }),
    )
  }, 60_000)

  test('a server fn only an erased handler and the split component call is in the lazy chunk; both calls give one payload', async () => {
    expect(build.client.where(innerId)).toBe('lazy')
    const { result } = await build.ssr.run(`${callByIdPrelude}return [
  await callById(${JSON.stringify(innerId)}, { username: 'TEST' }),
  await callById(${JSON.stringify(outerId)}, { username: 'TEST' }),
]`)
    expect(result).toEqual([
      { payload: { username: 'TEST' } },
      { payload: { username: 'TEST' } },
    ])
  })
})
