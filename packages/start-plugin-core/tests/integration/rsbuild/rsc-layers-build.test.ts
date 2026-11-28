/**
 * The production counterpart of rsc-layers-dev.test.ts: an Rsbuild RSC
 * build of `rsc-layers-app.ts` (each shared file a module in each layer of
 * the `ssr` environment), served as `rsbuild preview` serves it: each
 * layer's module serves its own role (SPEC J4.1, J4.2, J4.17), from a cold
 * build and from a build restored from the persistent cache.
 * Source: RSC investigation (rsc-investigation-model.md §4.1, 11-19).
 */
import { test } from 'vitest'
import { buildStart } from '../../build-start'
import { rsbuildRscLinks } from '../../start-plugins'
import { expectBothLayers, layersFiles } from './rsc-layers-app'

const timeout = 120_000

// (`warm`: the second of two builds, restored from the first's cache)
test.for([
  { kind: 'cold', builds: 1 },
  { kind: 'warm', builds: 2 },
])(
  'a $kind build: a server fn module and a client component of both layers serve each layer its role',
  { timeout },
  async ({ builds }) => {
    const build = await buildStart({
      bundler: 'rsbuild',
      files: layersFiles,
      entry: 'src/entry.ts',
      symlinks: rsbuildRscLinks(),
      start: { rsc: { enabled: true } } as never,
      builds,
      rsbuildConfig: { performance: { buildCache: true } },
    })
    const { url } = await build.preview()
    await expectBothLayers(url, 'MARK_SHARED', 'box')
  },
)
