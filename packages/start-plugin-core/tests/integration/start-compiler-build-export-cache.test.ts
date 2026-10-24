/**
 * Start compiler behaviour that only a production build exercises
 * (build-mode export caches), moved from known-bugs-start-compiler.test.ts
 * onto the production mode of the public Start host
 * (`createStartHost({ serve: false })` + `preview()`: `vite build` with
 * Start's plugin of the built `@tanstack/react-start`, Start's preview
 * server, a hydrated production page).
 *
 * What is observed: the build succeeds, the client build bundles no
 * server-only module (the modules of the client chunks, by resolved id;
 * import protection is off, as on the fast tier's hosts), and each
 * importer's server fn, called from the production page, reaches its
 * handler on the server. Each row is its own app and build, so a row whose
 * build fails fails alone.
 *
 * The importers are compiled in a fixed order, as an app's import graph
 * orders them: `via-a.tsx` (a case module the build reaches at once)
 * imports the builder through the head of the chain, and statically
 * imports the importers through the other modules of the chain
 * (`later/via-<module>.tsx`, reached only through it), so the bundler
 * compiles them after it. (With every importer reached at once, the build
 * compiles them in parallel and the outcome below depended on their timing:
 * the "export * diamonds" row failed in about 1 of 10 runs.)
 */
import { describe, expect, test } from 'vitest'
import { callFromClient, createStartHost } from '../regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * Builds an app with the `base` builder in `d.ts`, re-exported through
 * `reExports` (whose first module is the head of the chain), an importer
 * `via-a.tsx` of `base` through the head (`viaA`), and an importer of
 * `base` through each other module of the chain, compiled after it (see the
 * module comment; re-exported by `via-a.tsx` as `via_<module>`). Checks
 * that no server-only module is in the client build and that each
 * importer's server fn, called from the production page, reaches its
 * handler.
 */
async function expectImportersThroughRpc(reExports: Record<string, string>) {
  const [first, ...others] = Object.keys(reExports).map((file) =>
    file.replace(/\.ts$/, ''),
  )
  const host = await createStartHost({ serve: false })
  try {
    const startCase = await host.case({
      'd.ts': `${head}export const base = createServerFn()`,
      'db.server.ts': `export const db = { x: () => 'from the server' }\n`,
      ...reExports,
      'via-a.tsx': `import { base } from './${first}'
import { db } from './db.server'
export const viaA = base.handler(async () => db.x())
${others.map((name) => `export { via as via_${name} } from './later/via-${name}'`).join('\n')}
`,
      ...Object.fromEntries(
        others.map((name) => [
          `later/via-${name}.tsx`,
          `import { base } from '../${name}'
import { db } from '../db.server'
export const via = base.handler(async () => db.x())
`,
        ]),
      ),
    })
    const { build } = await host.preview()
    const serverOnlyFile = startCase.file('db.server.ts')
    const clientModules = build.environments.client!.chunks.flatMap(
      (chunk) => chunk.moduleIds,
    )
    expect(
      clientModules.filter((id) => id.split('?')[0] === serverOnlyFile),
      'the server-only module in the client build',
    ).toEqual([])
    for (const name of ['viaA', ...others.map((other) => `via_${other}`)]) {
      expect(
        await callFromClient(startCase, `module.${name}`, undefined, {
          file: 'via-a.tsx',
        }),
        name,
      ).toBe('from the server')
    }
  } finally {
    await host.close()
  }
}

describe('server code in the client bundle', () => {
  // Control for the pins below (same harness, same order): a chain without
  // a diamond or a cycle.
  test('importers through an export * chain call their server fn through its RPC', async () => {
    await expectImportersThroughRpc({
      'a.ts': `export * from './b'`,
      'b.ts': `export * from './d'`,
    })
  })

  // Bug: build-mode export lookups are cached per module, but the parallel
  // `export *` branches of one lookup share one visited set: in a diamond
  // (a -> b -> d, a -> c -> d) the branch that reaches `d` second finds it
  // visited and caches its own module (`b` or `c`) as not exporting
  // `base`; in a cycle (a -> b -> a, a -> d) the lookup through `a` caches
  // `b` the same way. An importer compiled after that, through the module
  // cached as "not found", is left untransformed.
  // Impact: that importer's handler and the server-only module it reads
  // ship to the client, and its server fn never reaches the server (the
  // client call resolves to `undefined`).
  // Fix-agnostic: no server-only module in the client build, and every
  // importer's server fn reaches its handler.
  // Source: known-bugs-start-compiler.test.ts "export * $name do not poison the
  // build-mode export cache" (formerly a pin on the internal compiler; kept as
  // a passing regression test, not reproduced through a real build). The
  // intermittent failure of the diamond row (about 1 in 10 runs, when every
  // importer compiled in parallel) was this bug, reached when the build
  // happened to compile an importer after the lookup that poisoned the cache.
  // Reproduced in every run with the compile order fixed (control above:
  // green).
  test.fails.each<{ name: string; reExports: Record<string, string> }>([
    {
      name: 'diamonds',
      reExports: {
        'a.ts': `export * from './b'
export * from './c'`,
        'b.ts': `export * from './d'`,
        'c.ts': `export * from './d'`,
      },
    },
    {
      name: 'cycles',
      reExports: {
        'a.ts': `export * from './b'
export * from './d'`,
        'b.ts': `export * from './a'`,
      },
    },
  ])(
    'export * $name do not poison the build-mode export cache',
    async ({ reExports }) => {
      await expectImportersThroughRpc(reExports)
    },
  )
})
