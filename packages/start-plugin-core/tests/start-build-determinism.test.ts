/**
 * Start builds are deterministic (R4): the same app gives the same output
 * and the same server fn ids wherever it is built, and the client's ids
 * reach the same handlers in the SSR build whatever order each build
 * compiles the modules in. Builds go through Start's Vite and Rsbuild
 * plugins (build-harness.ts); each build is in a new temporary directory.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'
import type { StartBuild } from './build-harness'

const timeout = 60_000

/** An app with server fns in two modules, a route and a lazy module. */
const appFiles: Record<string, string> = {
  ...routerRuntimeFiles,
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
  'src/entry.ts': `export { greet as greetA } from './a'
export { greet as greetB, lazy } from './b'
export { getRouter } from './router'
`,
}

/** The app's files in reverse order (the order the harness writes them in). */
const reversed = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).reverse())

/** Code of every chunk of a build by file name, and the server fn ids. */
async function describeOutput(build: StartBuild) {
  const chunks = (result: StartBuild['client']) =>
    Object.fromEntries(
      result.chunks.map((chunk) => [chunk.fileName, chunk.code]),
    )
  return {
    ids: (
      await build.client.run(
        `return [entry.greetA.functionId, entry.greetB.functionId]`,
      )
    ).result,
    client: chunks(build.client),
    ssr: chunks(build.ssr),
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: oracle-gaps H3 (no two-roots / build-twice comparison; ids are
  // meant to depend only on the path relative to the root).
  test(
    'the same app built in two directories, its files written in another order, gives the same output and server fn ids',
    async () => {
      const first = await buildStart({
        bundler,
        files: appFiles,
        entry: 'src/entry.ts',
      })
      const second = await buildStart({
        bundler,
        files: reversed(appFiles),
        entry: 'src/entry.ts',
      })
      expect(first.client.root).not.toBe(second.client.root)
      const output = await describeOutput(first)
      expect(output.ids).toEqual([expect.any(String), expect.any(String)])
      expect(await describeOutput(second)).toEqual(output)
    },
    timeout,
  )

  // A `generateFunctionId` giving two server fns the same id. Either the
  // build fails with an error naming the id, or each server fn gets its own
  // id and each client id reaches its own handler in the SSR build, which
  // compiles the two modules in the opposite order. A build that silently
  // runs the wrong handler is never right.
  // Source: oracle-gaps H3 (dedup suffix depends on compile order);
  // coordinator ruling 2026-10-18 (either outcome).
  test(
    'with colliding custom ids and opposite compile orders, the build fails naming the id, or each client id runs its own handler in the SSR build',
    async () => {
      const outcome = await buildStart({
        bundler,
        files: {
          'src/a.ts': appFiles['src/a.ts']!,
          'src/b.ts': appFiles['src/b.ts']!,
          'src/lazy.ts': appFiles['src/lazy.ts']!,
          'src/client-entry.ts': `export { greet as greetA } from './a'
export { greet as greetB } from './b'
`,
          'src/ssr-entry.ts': `export { greet as greetB } from './b'
export { greet as greetA } from './a'
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => 'same-id' } },
      }).catch((error: unknown) => error)
      if (outcome instanceof Error) {
        expect(outcome.message).toContain('same-id')
        return
      }
      const { client, ssr } = outcome as StartBuild
      const ids = (
        await client.run(
          `return { a: entry.greetA.functionId, b: entry.greetB.functionId }`,
        )
      ).result as { a: string; b: string }
      expect(ids.a).not.toBe(ids.b)
      const { result } = await ssr.run(`const call = async (id) =>
  (await entry.getServerFnById(id, { origin: 'client' }))({})
return {
  a: await call(${JSON.stringify(ids.a)}),
  b: await call(${JSON.stringify(ids.b)}),
  ssrIds: { a: entry.greetA.functionId, b: entry.greetB.functionId },
}`)
      expect(result).toEqual({ a: 'MARK_A', b: 'MARK_B', ssrIds: ids })
    },
    timeout,
  )
})
