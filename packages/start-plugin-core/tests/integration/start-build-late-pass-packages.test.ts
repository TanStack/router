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
import vue from '@vitejs/plugin-vue'
import { describe, expect, test } from 'vitest'
import {
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { buildStart } from '../build-start'
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

/** The app, its entries importing the package's MDX page `page` (`files`: the package's other modules). */
function app(
  declaration: StartDeclaration,
  page: string,
  files: Record<string, string> = { 'index.js': `export {}\n` },
) {
  const kit = installPackage('npm', {
    name: 'mdx-kit',
    declaration,
    files: { 'page.mdx': page, ...files },
  })
  return {
    files: {
      ...kit.files,
      'src/entry.ts': `export * from 'mdx-kit/page.mdx'\n`,
      'src/ssr-entry.ts': `export * from 'mdx-kit/page.mdx'\n${callByIdExports}`,
    },
    symlinks: kit.symlinks,
    packageJson: appManifest([kit]),
    entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
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

  // A package that declares Start hands Start values on under any name:
  // the late pass takes its modules as before decision D-30, whatever their
  // text names.
  // Source: the reviews of settlement step 3 (Fable `d30.mjs`, Gemini;
  // Astra `step3-optional.mjs`).
  test(
    "a Start-declaring package's MDX module calling a renamed createServerOnlyFn: its body stays off the client",
    async () => {
      const build = await buildStart({
        bundler,
        ...app(
          'peer',
          `import { so } from './index.js'
export const only = so(() => 'MARK_PKG_ONLY')
`,
          {
            'index.js': `export { createServerOnlyFn as so } from '@tanstack/react-start'\n`,
          },
        ),
        ...mdxConfig,
      })
      expect(build.client.where('MARK_PKG_ONLY')).toBe('nowhere')
    },
    timeout,
  )

  test(
    "a Start-declaring package's MDX module finishing an imported builder by an optional call: the server answers it, the client has no handler",
    async () => {
      const build = await buildStart({
        bundler,
        ...app(
          'peer',
          `import { base } from './b.js'
export const fn = base.handler?.(async () => 'MARK_PKG_OPTIONAL')
`,
          {
            'index.js': `export {}\n`,
            'b.js': `import { createServerFn } from '@tanstack/react-start'\nexport const base = createServerFn()\n`,
          },
        ),
        ...mdxConfig,
      })
      expect(build.client.where('MARK_PKG_OPTIONAL')).toBe('nowhere')
      const url = (await build.client.run('return entry.fn.url')).result
      const { result } = await build.ssr.run(
        `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
      )
      expect(result).toBe('MARK_PKG_OPTIONAL')
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

// The same for a Vue SFC of a package that declares Start: Vue's output of
// its `<script setup>` block reaches the late pass.
// Source: Gemini's review of settlement step 3, check 3.
describe('vite build, a Vue SFC of a package that declares Start', () => {
  test(
    'calling a renamed createServerOnlyFn: its body stays off the client',
    async () => {
      const kit = installPackage('npm', {
        name: 'vue-kit',
        manifest: { peerDependencies: { '@tanstack/vue-start': '*' } },
        files: {
          'index.js': `export { createServerOnlyFn as so } from '@tanstack/vue-start'\n`,
          'Comp.vue': `<template>
  <p>kit</p>
</template>

<script setup>
import { so } from './index.js'
const only = so(() => 'MARK_VUE_KIT_ONLY')
defineExpose({ only })
</script>
`,
        },
      })
      const build = await buildStart({
        bundler: 'vite',
        framework: 'vue',
        files: {
          ...kit.files,
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/vue-router'
export const Route = createRootRoute()
`,
          'src/entry.ts': `export { default as Comp } from 'vue-kit/Comp.vue'\n`,
        },
        symlinks: kit.symlinks,
        packageJson: appManifest([kit]),
        entry: 'src/entry.ts',
        viteConfig: { plugins: [vue()] },
      })
      expect(build.client.where('MARK_VUE_KIT_ONLY')).toBe('nowhere')
    },
    timeout,
  )
})
