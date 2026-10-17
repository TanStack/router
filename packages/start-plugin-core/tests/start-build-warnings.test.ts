/**
 * Warnings of the Start compiler reach the user through the bundler's
 * warning channel (Vite: the plugin context's `warn`, Rolldown's warnings;
 * Rsbuild: the compilation's warnings), naming the module, once per module
 * and environment. The compiler warns through its external import transforms
 * (`compilerTransforms`, e.g. React's RSC CSS transform). Its errors fail
 * the build.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from './build-harness'
import type { StartCompilerImportTransform } from '../src/types'

const timeout = 60_000

/**
 * A server transform of `warnMe()` calls from `warn-lib` that warns about
 * each call it cannot handle (one with an argument).
 */
const warningTransform: StartCompilerImportTransform = {
  name: 'test-warning-transform',
  environment: 'server',
  imports: [{ libName: 'warn-lib', rootExport: 'warnMe' }],
  detect: /\bwarnMe\b/,
  transform: (candidates, context) => {
    for (const candidate of candidates) {
      if (candidate.path.node.arguments.length > 0) {
        context.warn?.(`MARK_WARNING: cannot handle warnMe() in ${context.id}`)
      }
    }
  },
}

const files = {
  'node_modules/warn-lib/package.json': JSON.stringify({
    name: 'warn-lib',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/warn-lib/index.js': `export const warnMe = (value) => value ?? 'none'\n`,
  'src/warned.ts': `import { warnMe } from 'warn-lib'
export const warned = () => warnMe('value')
`,
  'src/quiet.ts': `import { warnMe } from 'warn-lib'
export const quiet = () => warnMe()
`,
  'src/entry.ts': `export { warned } from './warned'
export { quiet } from './quiet'
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Bug (Rsbuild): the Rsbuild compiler host warns through the transform
  // context's `emitWarning` (rsbuild/start-compiler-host.ts
  // `warnTransformContext`), which Rsbuild's `api.transform` context does
  // not have (it has no warning API), so the optional call does nothing.
  // Impact: on Rsbuild, every Start compiler warning is dropped silently,
  // e.g. React's RSC CSS transform telling the user that a
  // `renderToReadableStream` call gets no styles (user ruling D8).
  // Source: oracle-gaps M2 (the Start compiler's warning channel, Vite
  // `this.warn` and Rsbuild `emitWarning`, was never tested).
  ;(bundler === 'rsbuild' ? test.fails : test)(
    'a compiler warning reaches the user once, naming the module, from the environment that compiled it',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        compilerTransforms: [warningTransform],
      })
      /** The modules each warning names. */
      const named = (messages: Array<string>) =>
        messages
          .filter((message) => message.includes('MARK_WARNING'))
          .map((message) => /src\/(\w+)\.ts/.exec(message)?.[1])
      // The console is shared by both environments.
      expect({
        client: named(client.warnings),
        reported: named([...ssr.warnings, ...ssr.consoleMessages]),
      }).toEqual({ client: [], reported: ['warned'] })
      expect((await ssr.run(`return entry.warned()`)).result).toBe('value')
    },
    timeout,
  )

  // Source: mutation round 3 sc-hosts 8 (on Rsbuild, the build hung forever
  // when the compiler's module resolution failed).
  test(
    'a server fn whose builder comes from a missing module fails the build, naming the module',
    async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      // A hanging build fails the test well before its timeout.
      const hang = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('the build hangs'), 20_000)
      })
      const outcome = await Promise.race([
        buildStart({
          bundler,
          files: {
            'src/fns.ts': `import { base } from './missing-base'
export const greet = base.handler(async () => 'MARK_HANDLER')
`,
            'src/entry.ts': `export { greet } from './fns'\n`,
          },
          entry: 'src/entry.ts',
        }).then(
          () => 'the build succeeds',
          (error: unknown) =>
            error instanceof Error ? error.message : String(error),
        ),
        hang,
      ]).finally(() => clearTimeout(timer))
      expect(outcome).toContain('missing-base')
    },
    timeout,
  )
})
