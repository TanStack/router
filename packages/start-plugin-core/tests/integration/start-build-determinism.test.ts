/**
 * Start builds are deterministic (SPEC G4, J4.4): the same app at the same
 * root gives the same output and server fn ids when it is built again, and
 * the same ids and results whatever order the build discovers its modules
 * in; within each build the client's ids reach the same handlers in the
 * SSR build. The same app at another root builds correctly too, but its
 * opaque ids and bytes need not equal the first root's (relocation is
 * correctness, not equality). Builds go through Start's Vite and Rsbuild
 * plugins (build-harness.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  expectDeterministic,
  expectRelocatable,
} from '@tanstack/compiler-test-utils/determinism'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

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

// Re-export barrels are real user inputs. The secondary module is reached
// through a chain in both environments, so the first compiler encounter is
// driven by graph discovery rather than two concurrent reads of siblings.
const collisionBarrels = Object.fromEntries(
  (['a', 'b'] as const).flatMap((name) =>
    Array.from({ length: 8 }, (_, index) => [
      `src/discover-${name}-${index}.ts`,
      `export * from './${index === 7 ? name : `discover-${name}-${index + 1}`}'`,
    ]),
  ),
)
const collisionEntries = (order: Array<'a' | 'b'>) =>
  Object.fromEntries(
    Object.entries(entries(order)).map(([file, code]) => [
      file,
      code.replace(`from './${order[1]}'`, `from './discover-${order[1]}-0'`),
    ]),
  )

const entry = { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' }

/**
 * What a build does: the id the client gives each server fn, the id the SSR
 * caller gives it, and what an HTTP call of each client id runs.
 */
async function observe(build: StartBuild) {
  const ids = (
    await build.client.run(
      `return { a: entry.greetA.serverFnMeta.id, b: entry.greetB.serverFnMeta.id }`,
    )
  ).result as { a: string; b: string }
  const { result } = await build.ssr.run(`${callByIdPrelude}
return {
  ssrIds: { a: entry.greetA.serverFnMeta.id, b: entry.greetB.serverFnMeta.id },
  results: {
    a: await callById(${JSON.stringify(ids.a)}),
    b: await callById(${JSON.stringify(ids.b)}),
  },
}`)
  return { ids, ...(result as { ssrIds: unknown; results: unknown }) }
}

/** Code of every chunk of a build by file name. */
const chunksOf = (build: StartBuild) =>
  Object.fromEntries(
    [...build.client.chunks, ...build.ssr.chunks].map((chunk) => [
      chunk.fileName,
      chunk.code,
    ]),
  )

/** Each build's own agreement: ids are set, SSR agrees, each runs its handler. */
function expectAgreement(observation: Awaited<ReturnType<typeof observe>>) {
  expect(observation.ids.a).not.toBe(observation.ids.b)
  expect(observation.ssrIds).toEqual(observation.ids)
  expect(observation.results).toEqual({ a: 'MARK_A', b: 'MARK_B' })
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: oracle-gaps H3; FIX-PLAN S01 (same root, repeated and reordered).
  test(
    'the same app built again at the same root gives the same output, and the same ids in another discovery order',
    async () => {
      const first = await buildStart({
        bundler,
        files: { ...appFiles, ...entries(['a', 'b']) },
        entry,
      })
      const firstObservation = await observe(first)
      expectAgreement(firstObservation)
      const firstChunks = chunksOf(first)
      // Built again, unchanged: the same output, byte for byte.
      const again = await first.rebuild()
      expect(await observe(again)).toEqual(firstObservation)
      expect(chunksOf(again)).toEqual(firstChunks)
      // The entry imports the modules in the opposite order: same ids.
      await expectDeterministic(
        [
          firstObservation,
          await observe(await again.rebuild(entries(['b', 'a']))),
        ],
        (observation) => observation,
      )
    },
    timeout,
  )

  // FIX-PLAN S01: relocation (G4) requires correctness at each root, not
  // equal ids.
  test(
    'the same app at another root builds correctly: within each build the client ids run their handlers',
    async () => {
      const builds: Record<string, StartBuild> = {}
      await expectRelocatable(
        ['first', 'second'],
        async (name) => {
          builds[name] = await buildStart({
            bundler,
            files: { ...appFiles, ...entries(['a', 'b']) },
            entry,
          })
          return observe(builds[name])
        },
        {
          check: expectAgreement,
          portable: (observation) => observation.results,
        },
      )
      expect(builds.first!.client.root).not.toBe(builds.second!.client.root)
    },
    timeout,
  )

  // A `generateFunctionId` giving two server fns the same id: the build
  // de-duplicates them with a suffix (`same-id`, `same-id_1`; docs
  // server-functions.md:417-430, SPEC J4.4), each client id reaches its own
  // handler, and the SSR build, which compiles the two modules in the
  // opposite order, agrees. Built again with the other discovery order, the
  // pairing still holds.
  // Source: oracle-gaps H3 (dedup suffix depends on compile order); FIX-PLAN
  // S03.
  describe('colliding custom ids', () => {
    let oppositeEnvironments: Awaited<ReturnType<typeof observe>>
    let first: Awaited<ReturnType<typeof observe>>
    let reordered: Awaited<ReturnType<typeof observe>>
    let cleanup: (() => Promise<void>) | undefined
    beforeAll(async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/a.ts': appFiles['src/a.ts']!,
          'src/b.ts': appFiles['src/b.ts']!,
          'src/lazy.ts': appFiles['src/lazy.ts']!,
          ...collisionBarrels,
          ...entries(['a', 'b'], ['b', 'a']),
        },
        entry,
        start: { serverFns: { generateFunctionId: () => 'same-id' } },
        registerCleanup: (dispose) => {
          cleanup = dispose
        },
      })
      oppositeEnvironments = await observe(build)
      first = await observe(await build.rebuild(collisionEntries(['a', 'b'])))
      reordered = await observe(
        await build.rebuild(collisionEntries(['b', 'a'])),
      )
    }, timeout)
    afterAll(() => cleanup?.())

    test('each client id runs its own handler in the SSR build in either discovery order', () => {
      for (const observation of [oppositeEnvironments, first, reordered]) {
        expectAgreement(observation)
        expect(new Set(Object.values(observation.ids))).toEqual(
          new Set(['same-id', 'same-id_1']),
        )
      }
    })

    // Bug: collision suffixes follow discovery order across fresh
    // builds: at the same root, with the server function modules unchanged,
    // the function-to-id mapping changes.
    // Source: start-SYNTH S03; the public fresh-build reversal workload above.
    // Impact: reordering the imports of an entry file, with no server
    // function changed, swaps which function each id calls: a client of the
    // previous build (an open tab during a deploy) runs the other function.
    test.fails(
      'fresh builds keep the function-to-id mapping when discovery order reverses',
      () => {
        expect(reordered.ids).toEqual(first.ids)
      },
    )
  })
})
