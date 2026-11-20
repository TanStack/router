/**
 * Builds that reuse the plugins of an earlier build (`samePlugins`): a
 * program that calls Vite's `createBuilder(inlineConfig)` again with the
 * same inline config gets the same Start plugin objects back, and one that
 * calls `build()` again on an Rsbuild instance builds with the same
 * plugins. Each build is a build of its own, as with a config file (new
 * plugin objects each time): it compiles the files as they are now, and its
 * own server build lists the server fns of its own client build. A Vite
 * build whose server environment builds before the client's (an app
 * plugin's `buildApp`, a hand-written `createBuilder().build(ssr)`), in the
 * first build or a later one, fails instead of producing a server that
 * answers no client call: the server's manifest of HTTP-callable server
 * fns lists what the client build references. A second build prerenders
 * with its own server (Node keeps a module it imported by its URL, and the
 * server's files keep their names from one build to the next).
 */
import fs from 'node:fs'
import path from 'node:path'
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
import type { RsbuildConfig } from '@rsbuild/core'
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

/** An app plugin building the server environment first. */
const serverFirstPlugin: Plugin = {
  name: 'app:server-first',
  async buildApp(builder) {
    await builder.build(builder.environments.ssr!)
  },
}

test(
  'a Vite build of the server environment before the client fails',
  async () => {
    const outcome = await buildStart({
      files: {
        'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREETING')
`,
        'client-entry.ts': `export { greet } from './fns'\n`,
        'ssr-entry.ts': `export { greet } from './fns'\n${callByIdExports}`,
      },
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      viteConfig: { plugins: [serverFirstPlugin] },
    }).then(
      async (build) => {
        const url = (await build.client.run(`return entry.greet.url`)).result
        const call = await build.ssr
          .run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
          )
          .then(
            ({ result }) => result,
            (error: unknown) => String(error),
          )
        return { built: true as const, call }
      },
      (error: unknown) => {
        if (!(error instanceof StartBuildError)) {
          throw error
        }
        return { built: false as const, diagnostics: error.diagnostics }
      },
    )
    if (outcome.built) {
      expect.fail(
        `the build succeeded; a client call of the server fn gives ${JSON.stringify(outcome.call)}`,
      )
    }
    expectDiagnostic(outcome.diagnostics, { severity: 'error' })
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

test(
  'rsbuild: a second build prerenders with its own server',
  async () => {
    const route = (
      caption: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Home })
function Home() {
  return <main>${caption}</main>
}
`
    const first = await buildStart({
      bundler: 'rsbuild',
      samePlugins: true,
      // (absolute: Start resolves the output directories it prerenders
      // from against the process's working directory)
      rsbuildConfig: {
        plugins: [
          {
            name: 'test:absolute-dist',
            setup(api) {
              api.modifyRsbuildConfig({
                order: 'pre',
                handler: (config: RsbuildConfig) => {
                  config.output = {
                    ...config.output,
                    distPath: {
                      ...(config.output?.distPath as object),
                      root: path.join(api.context.rootPath, 'dist'),
                    },
                  }
                },
              })
            },
          },
        ],
      },
      entry: 'src/entry.ts',
      files: {
        'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
        'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`,
        'src/routes/index.tsx': route('PRERENDER_FIRST'),
        'src/entry.ts': `export {}\n`,
        'tsconfig.json': JSON.stringify({
          compilerOptions: { jsx: 'react-jsx' },
        }),
      },
      start: {
        pages: [{ path: '/' }],
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
        },
      },
    })
    const page = () =>
      fs
        .readFileSync(path.join(first.client.outDir, 'index.html'), 'utf8')
        .match(/<main>(.*?)<\/main>/)?.[1]
    expect(page()).toBe('PRERENDER_FIRST')
    await first.rebuild({ 'src/routes/index.tsx': route('PRERENDER_SECOND') })
    expect(page()).toBe('PRERENDER_SECOND')
  },
  timeout,
)
