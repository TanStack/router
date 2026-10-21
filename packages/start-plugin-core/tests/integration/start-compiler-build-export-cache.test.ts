/**
 * Start compiler behaviour that only a production build exercises
 * (build-mode export caches), moved from known-bugs-start-compiler.test.ts
 * (workstream B2) onto the production mode of the public Start host
 * (`createStartHost({ serve: false })` + `preview()`: `vite build` with
 * Start's plugin of the built `@tanstack/react-start`, Start's preview
 * server, a hydrated production page).
 *
 * What is observed: the build succeeds, the client build bundles no
 * server-only module (the modules of the client chunks, by resolved id;
 * import protection is off, as on the fast tier's hosts), and each
 * importer's server fn, called from the production page, reaches
 * its handler on the server. Each row is its own app and build, so a row
 * whose build fails fails alone.
 */
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { callFromClient, createStartHost } from '../regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * Builds an app with the `base` builder in `d.ts`, re-exported through
 * `reExports`, and an importer `via-<module>.tsx` of `base` through each
 * module of the chain (one production build compiles them all), then checks
 * each importer (see the module comment).
 */
async function expectImportersThroughRpc(reExports: Record<string, string>) {
  const importers = Object.keys(reExports).map((file) => {
    const name = path.posix.basename(file, '.ts')
    return [
      `via-${name}.tsx`,
      `import { base } from './${name}'
import { db } from './db.server'
export const via = base.handler(async () => db.x())`,
    ] as const
  })
  const host = await createStartHost({ serve: false })
  try {
    const startCase = await host.case({
      'd.ts': `${head}export const base = createServerFn()`,
      'db.server.ts': `export const db = { x: () => 'from the server' }\n`,
      ...reExports,
      ...Object.fromEntries(importers),
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
    for (const [file] of importers) {
      expect(
        await callFromClient(startCase, 'module.via', undefined, { file }),
        file,
      ).toBe('from the server')
    }
  } finally {
    await host.close()
  }
}

describe('server code in the client bundle', () => {
  // A chain without a diamond or a cycle.
  test('importers through an export * chain call their server fn through its RPC', async () => {
    await expectImportersThroughRpc({
      'a.ts': `export * from './b'`,
      'b.ts': `export * from './d'`,
    })
  })

  // Formerly a pin (known-bugs-start-compiler.test.ts "export * $name do not
  // poison the build-mode export cache"): build-mode export lookups are
  // cached per module, but parallel `export *` branches share one visited
  // set, so in a diamond or a cycle a module that re-exports the builder can
  // be cached as "not found", and a later importer through it is left
  // untransformed (its handler and server-only imports ship to the client;
  // Start's import protection then fails the client build). The internal
  // harness reached it by compiling the importers one after another with
  // one compiler; a real production build of the same app compiles them
  // correctly (workstream B2: the pin's reachability through a public host
  // is not established), so the outcome is a regression test here.
  test.each<{ name: string; reExports: Record<string, string> }>([
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
