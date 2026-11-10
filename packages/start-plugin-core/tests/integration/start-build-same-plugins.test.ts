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
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBuild } from '../build-harness'
import type { Plugin, ViteBuilder } from 'vite'

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

test(
  'vite: environments built by hand, client then server, are one build',
  async () => {
    // a program's own `createBuilder()` then `builder.build(env)` (no `buildApp`)
    const byHand = async (builder: ViteBuilder) => {
      await builder.build(builder.environments.client!)
      await builder.build(builder.environments.ssr!)
    }
    const callFromClient = async (build: StartBuild) => {
      const url = (await build.client.run(`return entry.greet.url`)).result
      return (
        await build.ssr.run(
          `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
        )
      ).result
    }
    const first = await buildStart({
      samePlugins: true,
      viteBuild: byHand,
      files: {
        'lib.ts': `export const defineFn = () => ({ handler: (fn: () => string) => fn })\n`,
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { defineFn } from './lib'
export const greet = createServerFn().handler(async () => 'MARK_GREETING')
export const other = defineFn().handler(() => 'MARK_HANDLER')
`,
        'client-entry.ts': `export { greet, other } from './fns'\n`,
        'ssr-entry.ts': `export { greet, other } from './fns'\n${callByIdExports}`,
      },
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
    })
    // the server answers the client's call: it read the client's build
    expect(await callFromClient(first)).toBe('MARK_GREETING')
    expect(first.client.where('MARK_HANDLER')).not.toBe('nowhere')
    // a second build by hand with the same plugins is another build
    const second = await first.rebuild({
      'lib.ts': `export { createServerFn as defineFn } from '@tanstack/react-start'\n`,
    })
    expect(await callFromClient(second)).toBe('MARK_GREETING')
    expect(second.client.where('MARK_HANDLER')).toBe('nowhere')
  },
  timeout,
)
