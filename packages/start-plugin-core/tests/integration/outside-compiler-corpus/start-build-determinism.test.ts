/**
 * Not part of the compiler test corpus (SYNTHESIS S7-109, the byte half):
 * today's Start builds emit the same bytes and chunk file names when the
 * same app is built again at the same root. SPEC §8 does not require equal
 * emitted bytes; the corpus test "the same app built again at the same root
 * gives the same ids and results" in
 * `integration/start-build-determinism.test.ts` decides the determinism a
 * compiler owes.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, callByIdExports, startBundlers } from '../../build-harness'
import type { StartBuild } from '../../build-harness'

const timeout = 60_000

/** An app with server fns in two modules, a route and a lazy module. */
const appFiles: Record<string, string> = {
  'src/a.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_A')
`,
  'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_B')
export const lazy = () => import('./lazy')
`,
  'src/lazy.ts': `export const lazy = () => 'MARK_LAZY'\n`,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => 'MARK_COMPONENT',
})
`,
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
}

/**
 * A test entry: re-exports the server fns of `order`'s modules, in that
 * order (the order the build discovers them in); the SSR one also what
 * calls by id need.
 */
function entryModule(order: Array<'a' | 'b'>, env: 'client' | 'ssr') {
  return `${order
    .map(
      (name) =>
        `export { greet as greet${name.toUpperCase()}${name === 'b' ? ', lazy' : ''} } from './${name}'`,
    )
    .join('\n')}
export { getRouter } from './router'
${env === 'ssr' ? callByIdExports : ''}`
}

/** The app's entries, importing the modules in `order`. */
const entries = (order: Array<'a' | 'b'>, ssrOrder = order) => ({
  'src/client-entry.ts': entryModule(order, 'client'),
  'src/ssr-entry.ts': entryModule(ssrOrder, 'ssr'),
})

const entry = { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' }

/** Code of every chunk of a build by file name. */
const chunksOf = (build: StartBuild) =>
  Object.fromEntries(
    [...build.client.chunks, ...build.ssr.chunks].map((chunk) => [
      chunk.fileName,
      chunk.code,
    ]),
  )

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'the same app built again at the same root gives the same output, byte for byte',
    async () => {
      const first = await buildStart({
        bundler,
        files: { ...appFiles, ...entries(['a', 'b']) },
        entry,
      })
      const firstChunks = chunksOf(first)
      const again = await first.rebuild()
      expect(chunksOf(again)).toEqual(firstChunks)
    },
    timeout,
  )
})
