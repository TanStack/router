/**
 * Server-only imports the client cannot resolve, in real production builds
 * through Start's Vite and Rsbuild plugins (build-harness.ts): a platform
 * module (`cloudflare:workers`, read by a middleware `.server()`) and a Node
 * builtin (`node:fs`, read by a handler) that only removed server code uses
 * (SPEC J4.12). No polyfill or alias plugin: the client build must not try
 * to resolve them. The server build marks the platform module external, as
 * a Cloudflare app does, and Node's builtin is external anyway; the SSR run
 * provides the platform module the way the worker runtime would (a module
 * resolve hook of Node, registered by the SSR entry before any module of
 * the app links: the one stand-in, as the test process is no worker).
 * Source: FIX-PLAN V2-02 (start-fable SF-22/MW-7; #6185, #7460, #3990;
 * 1,007 corpus files, 241 with `cloudflare:workers`).
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import type { StartBundler } from '../build-harness'

const timeout = 60_000

const platform = `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { existsSync } from 'node:fs'
export const withEnv = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { secret: env.SECRET } }),
)
export const readConfig = createServerFn()
  .middleware([withEnv])
  .handler(async ({ context }) => [
    context.secret,
    existsSync(process.cwd()) ? 'MARK_FS_OK' : 'MARK_FS_MISSING',
  ])
export const label = () => 'MARK_CLIENT_LABEL'
`

/** String-binding contract for the resolve hook, checked against workerd below; what the worker runtime provides for `cloudflare:workers`. */
const workerEnvModule = `export const env = { SECRET: 'MARK_ENV_SECRET' }`

const workerResolveHook = `import { registerHooks } from 'node:module'
export const workerRequests = new Set()
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      workerRequests.add(specifier)
      return {
        url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(workerEnvModule)}),
        shortCircuit: true,
      }
    }
    return next(specifier, context)
  },
})`

const files = {
  'src/platform.ts': platform,
  'src/client-entry.ts': `export { readConfig, label } from './platform'\n`,
  // Dynamic import lets the hook register before the app module links.
  'src/ssr-entry.ts': `${workerResolveHook}
export const platform = () => import('./platform')
${callByIdExports}`,
}

/** The server build of each bundler leaves the platform module external. */
const externalPlatform: Record<
  StartBundler,
  Pick<Parameters<typeof buildStart>[0], 'viteConfig' | 'rsbuildConfig'>
> = {
  vite: {
    viteConfig: {
      environments: { ssr: { resolve: { external: ['cloudflare:workers'] } } },
    },
  },
  rsbuild: {
    rsbuildConfig: {
      environments: { ssr: { output: { externals: ['cloudflare:workers'] } } },
    },
  },
}

describe.each(startBundlers)('%s build', (bundler) => {
  test.each([
    { name: 'sideEffects unset', sideEffects: undefined },
    { name: 'sideEffects false', sideEffects: false },
  ])(
    'the client build succeeds without the platform and builtin modules; the server build keeps them and the server fn runs ($name)',
    async ({ sideEffects }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        sideEffects,
        ...externalPlatform[bundler],
      })
      expect({
        platform: client.where('cloudflare:workers'),
        builtin: client.where('node:fs'),
        secret: client.where('MARK_ENV_SECRET'),
        label: client.where('MARK_CLIENT_LABEL'),
      }).toEqual({
        platform: 'nowhere',
        builtin: 'nowhere',
        secret: 'nowhere',
        label: 'eager',
      })
      const clientRun = (
        await client.run(`${requestsOfPrelude}return {
  label: entry.label(),
  url: entry.readConfig.url,
  requests: await requestsOf(entry.readConfig),
}`)
      ).result as { label: string; url: string; requests: Array<unknown> }
      expect(clientRun.label).toBe('MARK_CLIENT_LABEL')
      expect(clientRun.requests).toEqual([
        { url: clientRun.url, method: 'GET' },
      ])
      const id = (await client.run(`return entry.readConfig.serverFnMeta.id`))
        .result
      const { result } =
        await ssr.run(`${callByIdPrelude}const { readConfig } = await entry.platform()
return {
  ssr: await readConfig(),
  byId: await callById(${JSON.stringify(id)}),
  externalRequests: [...entry.workerRequests],
}`)
      const expected = ['MARK_ENV_SECRET', 'MARK_FS_OK']
      expect(result).toEqual({
        ssr: expected,
        byId: expected,
        // A real external resolution, consumed by the middleware above:
        // the hook's own specifier string is insufficient evidence.
        externalRequests: expect.arrayContaining(['cloudflare:workers']),
      })
    },
    timeout,
  )
})

// Internal harness contract (SPEC §8): the narrow resolve hook supplies a
// string binding with the same module-import behaviour as real workerd.
// Worker execution here is Miniflare's workerd, from the installed Cloudflare
// e2e app; it is not a second implementation of the platform module.
test('the cloudflare:workers resolve-hook binding agrees with workerd', async () => {
  const require = createRequire(
    new URL(
      '../../../../e2e/react-start/basic-cloudflare/package.json',
      import.meta.url,
    ),
  )
  const workerRequire = createRequire(require.resolve('wrangler'))
  const miniflareUrl = pathToFileURL(workerRequire.resolve('miniflare')).href
  const { Miniflare } = await import(/* @vite-ignore */ miniflareUrl)
  const worker = new Miniflare({
    modules: true,
    compatibilityDate: '2026-03-17',
    bindings: { SECRET: 'MARK_ENV_SECRET' },
    script: `import { env } from 'cloudflare:workers'
export default { fetch() { return Response.json({ secret: env.SECRET, missing: env.MISSING ?? null }) } }`,
  })
  try {
    const response = await worker.dispatchFetch('http://localhost/')
    const actual = await response.json()
    const { stdout } = await runNodeProgram(`${workerResolveHook}
const { env } = await import('cloudflare:workers')
const { existsSync } = await import('node:fs')
console.log(JSON.stringify({ binding: { secret: env.SECRET, missing: env.MISSING ?? null }, delegated: existsSync(process.cwd()) }))`)
    expect(JSON.parse(stdout)).toEqual({ binding: actual, delegated: true })
    expect(actual).toEqual({ secret: 'MARK_ENV_SECRET', missing: null })
  } finally {
    await worker.dispose()
  }
}, 30_000)
