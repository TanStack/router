/**
 * A split route option value in a type wrapper (`as`, `satisfies`, `!`)
 * whose value Start compiles differently per environment: the chunk holds
 * the value as each build compiled it. Run by two files: with the
 * compiler's self-checks on (our suites) and off (users' builds, where a
 * copy that dropped Start's edit would build silently and ship the
 * server's code to the client).
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

const timeout = 60_000

const SECRET = 'MARK_SECRET'

/** The files under `dir` (but `skip`) whose text holds the server's marker. */
async function filesWithSecret(
  dir: string,
  skip: ReadonlyArray<string> = [],
): Promise<Array<string>> {
  const found: Array<string> = []
  for (const top of await readdir(dir, { withFileTypes: true })) {
    if (skip.includes(top.name)) {
      continue
    }
    const entries = top.isDirectory()
      ? await readdir(path.join(dir, top.name), {
          recursive: true,
          withFileTypes: true,
        })
      : [top]
    for (const entry of entries) {
      const file = path.join(entry.parentPath, entry.name)
      if (entry.isFile() && (await readFile(file, 'latin1')).includes(SECRET)) {
        found.push(path.relative(dir, file))
      }
    }
  }
  return found
}

const routeModule = (loader: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import {
  createIsomorphicFn,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => 'MARK_COMPONENT',
})
`

/** What the route's loader gives where `run` runs (a split one loads its chunk). */
const runLoader = `const route = Object.values(entry.getRouter().routeTree.children).find(
  (candidate) => candidate.options.id === '/',
)
const { loader } = route.options
const fn = typeof loader === 'function' ? loader : loader.handler
try {
  return { value: await fn({}) }
} catch (error) {
  return { error: error.message }
}`

export function splitWrappedValueTests() {
  describe.each(startBundlers)('%s build', (bundler) => {
    const build = (module: string) =>
      buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': module,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/client-entry.ts': `export { getRouter } from './router'\n`,
          'src/ssr-entry.ts': `export { getRouter } from './router'\n`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: {
          router: {
            codeSplittingOptions: {
              defaultBehavior: [['loader'], ['component']] as Array<
                Array<'loader' | 'component'>
              >,
            },
          },
        },
      })

    // A server fn written in place as the loader, in a wrapper, or as the
    // handler of an object-form loader: the loader stays in the route module
    // (Start rewrites a server fn written in place there; `satisfies`, `!`
    // and an object are values main's chunk compile cannot take, R153); the
    // client ships none of the server fn's body, and the server runs it.
    test.each([
      `createServerFn().handler(async () => '${SECRET}') as any`,
      `createServerFn().handler(async () => '${SECRET}') satisfies unknown`,
      `createServerFn().handler(async () => '${SECRET}')!`,
      `{ handler: createServerFn().handler(async () => '${SECRET}') as any }`,
    ])(
      'router.codeSplittingOptions: a loader `%s` stays in the route module and runs on the server',
      async (loader) => {
        const built = await build(routeModule(loader))
        expect(await filesWithSecret(built.client.outDir)).toEqual([])
        expect((await built.ssr.run(runLoader)).result).toEqual({
          value: SECRET,
        })
      },
      timeout,
    )

    // A value Start compiles per environment, in a wrapper: the client's
    // build holds the client's compile of it (nothing of the server's
    // implementation), the server's build the server's. A call stays in
    // the route module (the compiler cannot tell it from an object-form
    // loader); a function is split, its chunk compiled for each build.
    test.each([
      {
        loader: `createServerOnlyFn(async () => '${SECRET}') as any`,
        client: {
          error:
            'createServerOnlyFn() functions can only be called on the server!',
        },
      },
      {
        loader: `createIsomorphicFn().server(async () => '${SECRET}').client(async () => 'client value') as any`,
        client: { value: 'client value' },
      },
      {
        loader: `(async () => createIsomorphicFn().server(() => '${SECRET}').client(() => 'client value')()) satisfies unknown`,
        client: { value: 'client value' },
      },
    ])(
      'router.codeSplittingOptions: a loader `$loader` configured for splitting runs as compiled for each build',
      async ({ loader, client }) => {
        const built = await build(routeModule(loader))
        expect(await filesWithSecret(built.client.outDir)).toEqual([])
        expect((await built.client.run(runLoader)).result).toEqual(client)
        expect((await built.ssr.run(runLoader)).result).toEqual({
          value: SECRET,
        })
      },
      timeout,
    )
  })
}
