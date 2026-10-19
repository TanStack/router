/**
 * Warnings of the Start compiler reach the user through the bundler's
 * warning channel (Vite: the plugin context's `warn`, Rolldown's warnings,
 * the dev server's logger; Rsbuild: the compilation's warnings), naming the
 * module, once per module and environment, in builds and on dev servers
 * with Start's whole plugin. The compiler warns through its external import
 * transforms (`compilerTransforms`, e.g. React's RSC CSS transform, whose
 * planned warning is dev-only, user ruling D8). Its errors fail the build.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'
import { warnMeTransform as warningTransform } from '../compiler-transforms-seam'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'

const timeout = 60_000

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

/** The modules each warning names (`src/<name>.ts`). */
const named = (messages: Array<string>) =>
  messages
    .filter((message) => message.includes('MARK_WARNING'))
    .map((message) => /src\/(\w+)\.ts/.exec(message)?.[1])

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

describe("dev servers with Start's plugin", () => {
  // Source: audit E2 (the planned D8 warning is dev-only: the warning
  // channel of the dev servers was never tested).
  test(
    'Vite dev: a compiler warning reaches the user once, naming the module, when the server loads it',
    async () => {
      const server = await startDevServer({
        start: {},
        compilerTransforms: [warningTransform],
        files,
      })
      // The browser and the server load the app
      await server.load('/src/entry.ts')
      const { warned } = await server.import('/src/entry.ts')
      await server.idle()
      expect(named(server.logs)).toEqual(['warned'])
      expect(warned()).toBe('value')
    },
    timeout,
  )

  // Bug: same as the Rsbuild build pin above: the Rsbuild compiler host
  // warns through the transform context's `emitWarning`, which Rsbuild's
  // `api.transform` context does not have.
  // Source: rsbuild/start-compiler-host.ts `warnTransformContext`.
  // Impact: on the Rsbuild dev server, every Start compiler warning is
  // dropped silently, including the dev-only warnings planned for React's
  // RSC CSS transform (user ruling D8).
  test.fails(
    'Rsbuild dev: a compiler warning reaches the user once, naming the module',
    async () => {
      const server = await startRsbuildStartDevServer({
        compilerTransforms: [warningTransform],
        files,
      })
      // Every compile's warnings (none is lost to a later compile)
      expect(
        named(
          findDiagnostics(server.diagnostics, { severity: 'warning' }).map(
            ({ text }) => text,
          ),
        ),
      ).toEqual(['warned'])
    },
    timeout,
  )
})
