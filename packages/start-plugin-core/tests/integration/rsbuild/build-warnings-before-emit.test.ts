/**
 * Start's Rsbuild host, when a build's warnings are on its compilations:
 * as each compilation seals, before it emits (rule 4 of the Rsbuild host),
 * so an app's plugin that reads a compilation's warnings after the seal (a
 * "no warnings" policy) sees Start's.
 * Source: review-hotspot3-impl-astra.md, finding 2.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-start'
import { appManifest } from '../../package-layouts'
import { uiKit, workerApp } from './worker-warning-apps'
import type { Rspack } from '@rsbuild/core'

/** An app's policy: a compilation with a warning once it sealed fails. */
const noWarnings = {
  apply(compiler: Rspack.Compiler) {
    compiler.hooks.thisCompilation.tap('app:no-warnings', (compilation) => {
      compilation.hooks.afterSeal.tap('app:no-warnings', () => {
        const count = compilation.getWarnings().length
        if (count > 0) {
          compilation.errors.push(
            new compiler.rspack.WebpackError(
              `POLICY: ${count} warning(s) in the ${compiler.name} compilation`,
            ),
          )
        }
      })
    })
  },
}

describe('rsbuild build: an app plugin that fails a compilation with warnings once it sealed', () => {
  const { 'src/worker.ts': _worker, ...files } = workerApp({ page: true })

  test('a page imports a package that uses Start and does not declare it: the build fails', async () => {
    await expect(
      buildStart({
        bundler: 'rsbuild',
        packageJson: appManifest([uiKit]),
        files,
        rsbuildConfig: { tools: { rspack: { plugins: [noWarnings] } } },
      }),
    ).rejects.toThrow(/POLICY: 1 warning/)
  })

  test('control, the package declares Start: the build passes', async () => {
    const manifest = `${uiKit.directory}/package.json`
    await buildStart({
      bundler: 'rsbuild',
      packageJson: appManifest([uiKit]),
      files: {
        ...files,
        [manifest]: JSON.stringify({
          ...JSON.parse(uiKit.files[manifest] ?? '{}'),
          peerDependencies: { '@tanstack/react-start': '*' },
        }),
      },
      rsbuildConfig: { tools: { rspack: { plugins: [noWarnings] } } },
    })
  })
})
