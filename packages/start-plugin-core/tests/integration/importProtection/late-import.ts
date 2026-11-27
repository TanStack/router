/**
 * A plugin of each host that adds code at the top of `src/late.ts` or
 * `src/late.js` after Start's compile (an import the compiler never reads), for
 * `bare-imports.test.ts` and `plugin-added-imports.test.ts`.
 */
import type { Plugin } from 'vite'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'

/**
 * A plugin that adds `code` at the top of `src/late.ts` (or `.js`) after
 * Start's compile; `byDirectory`: for each directory `dir`, its code at the
 * top of `src/<dir>/late.ts` (or `.js`) instead.
 */
export const lateImport = (
  code: string | Record<string, string>,
): {
  viteConfig: { plugins: Array<Plugin> }
  rsbuildConfig: RsbuildConfig
} => {
  const codes = typeof code === 'string' ? { '': code } : code
  const codeOf = (id: string) => {
    const dir = /\/src\/(?:([^/]+)\/)?late\.[jt]s$/.exec(id)
    return dir ? codes[dir[1] ?? ''] : undefined
  }
  return {
    viteConfig: {
      plugins: [
        {
          name: 'late-import',
          transform(text: string, id: string) {
            const added = codeOf(id)
            return added === undefined ? null : added + text
          },
        } satisfies Plugin,
      ],
    },
    rsbuildConfig: {
      plugins: [
        {
          name: 'late-import',
          setup(api) {
            api.transform(
              { test: /\/src\/(?:[^/]+\/)?late\.[jt]s$/ },
              ({ code: text, resourcePath }) => ({
                code: (codeOf(resourcePath) ?? '') + text,
              }),
            )
          },
        } satisfies RsbuildPlugin,
      ],
    },
  }
}
