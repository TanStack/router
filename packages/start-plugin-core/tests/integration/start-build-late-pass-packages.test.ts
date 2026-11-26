/**
 * An installed package's module another plugin compiles to JavaScript
 * (`.mdx`), on both hosts: the late pass admits it by the main pass's rule
 * (decision D-30: the package's text names a Start API, or import
 * protection's scope reaches it), whatever the package's class. Its server
 * fn's handler stays on the server; a module naming no Start API is left as
 * it is. Vite's late pass skipped every module of a package that does not
 * declare Start (by class), so such a package's handler shipped to the
 * client there (whole-PR review S5-09; Gemini: Vite skips opted-in
 * `.vue`/`.mdx`).
 *
 * Settlement design, step 3 (the late pass on `session.transform`).
 */
import { createRequire } from 'node:module'
import mdx from '@mdx-js/rollup'
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'
import { appManifest, installPackage } from '../package-layouts'
import type { StartBuildOptions } from '../build-harness'
import type { StartDeclaration } from '../package-layouts'

const require = createRequire(import.meta.url)
const timeout = 60_000

const mdxConfig = {
  viteConfig: { plugins: [{ enforce: 'pre', ...mdx() }] },
  rsbuildConfig: {
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /\.mdx$/,
              use: [{ loader: require.resolve('@mdx-js/loader') }],
            },
          ],
        },
      },
    },
  },
} satisfies Pick<StartBuildOptions, 'viteConfig' | 'rsbuildConfig'>

/** The app, its client entry importing the package's MDX page `page`. */
function app(declaration: StartDeclaration, page: string) {
  const kit = installPackage('npm', {
    name: 'mdx-kit',
    declaration,
    files: { 'page.mdx': page, 'index.js': `export {}\n` },
  })
  return {
    files: {
      ...kit.files,
      'src/entry.ts': `export * from 'mdx-kit/page.mdx'\n`,
    },
    symlinks: kit.symlinks,
    packageJson: appManifest([kit]),
    entry: 'src/entry.ts',
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  test.each<StartDeclaration>(['none', 'peer'])(
    "an installed package's MDX module using a Start factory (Start declared: %s): its handler stays on the server",
    async (declaration) => {
      const build = await buildStart({
        bundler,
        ...app(
          declaration,
          `# A page

import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_PKG_HANDLER')
`,
        ),
        ...mdxConfig,
      })
      expect(build.client.where('MARK_PKG_HANDLER')).toBe('nowhere')
      expect(
        typeof (await build.client.run('return entry.fn.url')).result,
      ).toBe('string')
    },
    timeout,
  )

  test(
    "an installed package's MDX module naming no Start API is left as it is",
    async () => {
      const build = await buildStart({
        bundler,
        ...app('none', `# A page\n\nexport const note = 'MARK_PKG_NOTE'\n`),
        ...mdxConfig,
      })
      expect((await build.client.run('return entry.note')).result).toBe(
        'MARK_PKG_NOTE',
      )
    },
    timeout,
  )
})
