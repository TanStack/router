/**
 * Not part of the compiler test corpus (SYNTHESIS S7-163: a stand-in
 * contract control, SPEC §8). The resolve hook that provides
 * `cloudflare:workers` to the SSR runs of
 * `integration/start-build-v2-unresolvable-imports.test.ts` (the corpus test
 * that decides the compiler outcome) agrees with real workerd; no compiler
 * step runs here.
 */
import { expect, test } from 'vitest'
import { runNodeProgram } from '@tanstack/compiler-test-utils/run-node'
import { workerResolveHook } from '../worker-resolve-hook'

// Internal harness contract (SPEC §8): the narrow resolve hook supplies a
// string binding with the same module-import behaviour as real workerd.
// Worker execution here is Miniflare's workerd (a test-only devDependency, the
// version wrangler uses); it is not a second implementation of the platform
// module.
test('the cloudflare:workers resolve-hook binding agrees with workerd', async () => {
  const { Miniflare } = await import('miniflare')
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
