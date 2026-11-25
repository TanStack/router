/**
 * A plugin of each host that adds code at the top of `src/late.ts` or
 * `src/late.js` after Start's compile (an import the compiler never reads), for
 * `bare-imports.test.ts` and `plugin-added-imports.test.ts`.
 */
import type { Plugin } from 'vite'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'

/** A plugin that adds `code` at the top of `src/late.ts` (or `.js`) after Start's compile. */
export const lateImport = (
  code: string,
): {
  viteConfig: { plugins: Array<Plugin> }
  rsbuildConfig: RsbuildConfig
} => ({
  viteConfig: {
    plugins: [
      {
        name: 'late-import',
        transform(text: string, id: string) {
          return /\/src\/late\.[jt]s$/.test(id) ? code + text : null
        },
      } satisfies Plugin,
    ],
  },
  rsbuildConfig: {
    plugins: [
      {
        name: 'late-import',
        setup(api) {
          api.transform({ test: /\/src\/late\.[jt]s$/ }, ({ code: text }) => ({
            code: code + text,
          }))
        },
      } satisfies RsbuildPlugin,
    ],
  },
})
