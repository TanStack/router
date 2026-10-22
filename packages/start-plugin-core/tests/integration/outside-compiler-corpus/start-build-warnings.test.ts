/**
 * Not part of the compiler test corpus (SYNTHESIS S7-164, S7-166, S7-167:
 * implementation plumbing). These drive a synthetic external import
 * transform (`compilerTransforms`, through `../../compiler-transforms-seam`)
 * that reads the Babel-shaped transform candidate and calls the transform
 * context's `warn`: the internal extension API of today's Start compiler
 * (SPEC §1.2), which a correct rewrite may shape differently. What they
 * check, that such a warning reaches the user once, naming the module, on
 * each bundler, stays useful for today's implementation, and keeps the
 * Rsbuild bug pinned (Start compiler warnings dropped on Rsbuild).
 *
 * The compiler-acceptance counterpart is a real user-facing compiler
 * warning through public entry points: React's RSC CSS transform warning
 * about a `renderToReadableStream` argument it cannot see (user ruling D8,
 * SPEC J7.3), pinned in react-start-rsc's
 * `tests/integration/rsc-css.test.ts` ("dev: renderToReadableStream with
 * $name warns, naming the file"); start-plugin-core's tests cannot build an
 * RSC app (no `@vitejs/plugin-rsc` here).
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../../build-harness'
import { warnMeTransform as warningTransform } from '../../compiler-transforms-seam'
import { coreStartPlugins } from '../../outside-compiler-corpus/core-start-plugin'
import { startDevServer } from '../../dev-server'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

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
      const build = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        corePlugins: coreStartPlugins([warningTransform]),
      })
      const { client, ssr } = build
      // Every channel of the build, each report once (the console is
      // shared by both environments).
      expect({
        client: named(client.warnings.map(({ text }) => text)),
        reported: named(
          build.diagnostics
            .filter(({ severity }) => severity !== 'info')
            .map(({ text }) => text),
        ),
      }).toEqual({ client: [], reported: ['warned'] })
      expect((await ssr.run(`return entry.warned()`)).result).toBe('value')
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
        corePlugins: coreStartPlugins([warningTransform]),
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
        corePlugins: coreStartPlugins([warningTransform]),
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
