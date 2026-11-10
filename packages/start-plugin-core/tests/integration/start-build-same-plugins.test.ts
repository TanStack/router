/**
 * Builds that reuse the plugins of an earlier build (`samePlugins`): a
 * program that calls Vite's `createBuilder(inlineConfig)` again with the
 * same inline config gets the same Start plugin objects back, and one that
 * calls `build()` again on an Rsbuild instance builds with the same
 * plugins. Each build is a build of its own, as with a config file (new
 * plugin objects each time): it compiles the files as they are now, and its
 * own server build lists the server fns of its own client build.
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'
import type { Plugin } from 'vite'

const timeout = 90_000

test.each(startBundlers)(
  '%s: a second build compiles against the files as they are now',
  async (bundler) => {
    // `defineFn` is a plain function in the first build and Start's
    // `createServerFn` in the second; `fns.ts` itself does not change
    const first = await buildStart({
      bundler,
      samePlugins: true,
      files: {
        'lib.ts': `export const defineFn = () => ({ handler: (fn: () => string) => fn })\n`,
        'fns.ts': `import { defineFn } from './lib'
export const greet = defineFn().handler(() => 'MARK_HANDLER')
`,
        'entry.ts': `export { greet } from './fns'\n`,
      },
    })
    expect(first.client.where('MARK_HANDLER')).not.toBe('nowhere')
    const second = await first.rebuild({
      'lib.ts': `export { createServerFn as defineFn } from '@tanstack/react-start'\n`,
    })
    expect(second.client.where('MARK_HANDLER')).toBe('nowhere')
    expect((await second.ssr.run(`return await entry.greet()`)).result).toBe(
      'MARK_HANDLER',
    )
  },
  timeout,
)

test(
  'vite: a second build of the server environment before the client fails',
  async () => {
    // an app plugin building the server environment first, from the second build on
    let serverFirst = false
    const plugin: Plugin = {
      name: 'app:server-first',
      async buildApp(builder) {
        if (serverFirst) {
          await builder.build(builder.environments.ssr!)
        }
      },
    }
    const first = await buildStart({
      samePlugins: true,
      files: {
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREETING')
`,
        'entry.ts': `export { greet } from './fns'\n`,
      },
      viteConfig: { plugins: [plugin] },
    })
    expect(first.client.where('MARK_GREETING')).toBe('nowhere')
    serverFirst = true
    const second = await first.rebuild().then(
      () => null,
      (error: unknown) => {
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        return error.diagnostics
      },
    )
    if (second === null) {
      expect.fail('the second build, whose server built first, succeeded')
    }
    expectDiagnostic(second, { severity: 'error' })
  },
  timeout,
)
