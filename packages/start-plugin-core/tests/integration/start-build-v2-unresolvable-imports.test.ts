/**
 * Server-only imports the client cannot resolve, in real production builds
 * through Start's Vite and Rsbuild plugins (build-harness.ts): a platform
 * module (`cloudflare:workers`, read by a middleware `.server()`) and Node
 * builtins (`node:fs`, read by a handler; `node:buffer`, read by a helper
 * only a `createServerOnlyFn` body and an isomorphic `.server()` call) that
 * only removed server code uses (SPEC J4.12, G16). No polyfill or alias
 * plugin: the client build must not try to resolve them, and reports
 * nothing about them (no browser stub, no warning). The server build marks the platform module external, as
 * a Cloudflare app does, and Node's builtin is external anyway; the SSR run
 * provides the platform module the way the worker runtime would (a module
 * resolve hook of Node, registered by the SSR entry before any module of
 * the app links: the one stand-in, as the test process is no worker).
 * Source: #6185, #7460, #3990.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { workerResolveHook } from './worker-resolve-hook'
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

/** Environment functions whose server side reads the builtin through a helper. */
const encoding = `import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
import { Buffer } from 'node:buffer'
const toBase64 = (value: string) => Buffer.from(value).toString('base64')
export const encode = createServerOnlyFn(() => toBase64('server-only'))
export const encodeEither = createIsomorphicFn()
  .server(() => toBase64('isomorphic'))
  .client(() => 'MARK_CLIENT_ENCODE')
`

const files = {
  'src/platform.ts': platform,
  'src/encoding.ts': encoding,
  'src/client-entry.ts': `export { readConfig, label } from './platform'
export { encode, encodeEither } from './encoding'
`,
  // Dynamic import lets the hook register before the app module links.
  'src/ssr-entry.ts': `${workerResolveHook}
export const platform = () => import('./platform')
export const encoding = () => import('./encoding')
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
      const { client, ssr, root } = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        sideEffects,
        ...externalPlatform[bundler],
      })
      expect({
        platform: client.where('cloudflare:workers'),
        builtin: client.where('node:fs'),
        buffer: client.where('node:buffer'),
        secret: client.where('MARK_ENV_SECRET'),
        label: client.where('MARK_CLIENT_LABEL'),
      }).toEqual({
        platform: 'nowhere',
        builtin: 'nowhere',
        buffer: 'nowhere',
        secret: 'nowhere',
        label: 'eager',
      })
      // No stub either: a bundler that resolves a leftover import for the
      // browser (Vite's empty module for a Node builtin) warns about the
      // module that imports it (G16; by file and severity, §5.7).
      expect(
        ['src/platform.ts', 'src/encoding.ts'].flatMap((file) =>
          findDiagnostics(client.warnings, { file, root }),
        ),
      ).toEqual([])
      const clientRun = (
        await client.run(`${requestsOfPrelude}let refused = false
try {
  entry.encode()
} catch {
  refused = true
}
return {
  label: entry.label(),
  encoded: [refused, entry.encodeEither()],
  url: entry.readConfig.url,
  requests: await requestsOf(entry.readConfig),
}`)
      ).result as {
        label: string
        encoded: Array<unknown>
        url: string
        requests: Array<unknown>
      }
      expect(clientRun.label).toBe('MARK_CLIENT_LABEL')
      // The client refuses the server-only fn and runs its own
      // implementation (J4.9, J4.10).
      expect(clientRun.encoded).toEqual([true, 'MARK_CLIENT_ENCODE'])
      expect(clientRun.requests).toEqual([
        { url: clientRun.url, method: 'GET' },
      ])
      const url = (await client.run(`return entry.readConfig.url`)).result
      const { result } =
        await ssr.run(`${callByIdPrelude}const { readConfig } = await entry.platform()
const { encode, encodeEither } = await entry.encoding()
return {
  ssr: await readConfig(),
  encoded: [encode(), encodeEither()],
  byId: await callById(serverFnId(${JSON.stringify(url)})),
  externalRequests: [...entry.workerRequests],
}`)
      const expected = ['MARK_ENV_SECRET', 'MARK_FS_OK']
      expect(result).toEqual({
        ssr: expected,
        encoded: [
          Buffer.from('server-only').toString('base64'),
          Buffer.from('isomorphic').toString('base64'),
        ],
        byId: expected,
        // A real external resolution, consumed by the middleware above:
        // the hook's own specifier string is insufficient evidence.
        externalRequests: expect.arrayContaining(['cloudflare:workers']),
      })
    },
    timeout,
  )
})
