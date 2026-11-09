import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRsbuild } from '@rsbuild/core'
import { join } from 'pathe'
import { afterEach, describe, expect, test } from 'vitest'
import {
  RSBUILD_ENVIRONMENT_NAMES,
  tanStackStartRsbuild,
} from '../../src/rsbuild'
import type { RsbuildConfig } from '@rsbuild/core'

const roots: Array<string> = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

/** The dev server's `server.compress` once Start's plugin has run. */
async function devServerCompress(server: RsbuildConfig['server']) {
  const root = await mkdtemp(join(tmpdir(), 'tss-rsbuild-compress-'))
  roots.push(root)
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src/router.tsx'), 'export {}\n')

  const rsbuild = await createRsbuild({
    cwd: root,
    config: {
      root,
      server,
      plugins: [
        tanStackStartRsbuild({
          framework: 'react',
          defaultEntryPaths: {
            client: join(root, 'src/router.tsx'),
            server: join(root, 'src/router.tsx'),
            start: join(root, 'src/router.tsx'),
          },
          providerEnvironmentName: RSBUILD_ENVIRONMENT_NAMES.server,
          ssrIsProvider: true,
        }),
      ],
    },
  })
  await rsbuild.initConfigs({ action: 'dev' })
  return rsbuild.getNormalizedConfig().server.compress
}

describe('Rsbuild dev server compression', () => {
  test('is off when the app leaves server.compress unset', async () => {
    expect(await devServerCompress(undefined)).toBe(false)
  })

  // #8544: Start's plugin overrode the app's `server.compress`.
  test.each([true, false])(
    'follows the app when it sets server.compress to %s',
    async (compress) => {
      expect(await devServerCompress({ compress })).toBe(compress)
    },
  )
})
