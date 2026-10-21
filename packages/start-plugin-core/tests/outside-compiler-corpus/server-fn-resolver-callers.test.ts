/**
 * Implementation control (outside the compiler test corpus: see
 * packages/compiler-test-utils/AGENTS.md): the production resolver that the
 * internal generator (`generateServerFnResolverModule`, forced access
 * options) builds from what the callers reported, merged the way today's
 * hosts merge reports (`mergeServerFnsById`). A rewrite may resolve server
 * fn ids another way; what a real host delivers is the corpus's D6 goals
 * (integration/known-bugs-start-compiler.test.ts and
 * react-start-rsc's integration/rsc-start-dev.test.ts). Moved out of
 * createServerFn/createServerFn.test.ts (start N08).
 */
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'
import { mergeServerFnsById } from '../../src/start-compiler/host'
import { generateServerFnResolverModule } from '../../src/start-compiler/server-fn-resolver-module'
import { createServerGraph, serverFnResult } from './legacy/regression-helpers'
import type { ServerFn } from '../../src/start-compiler/types'

// The server function resolver rejects client-origin calls to functions that
// are not client-referenced (`includeClientReferencedCheck`, used when SSR is
// not the provider). A server fn the client compiles is callable from the
// client, through the resolver generated from what the callers reported
// (N14).
describe('server functions discovered in caller modules', () => {
  /**
   * Compiles `code` in each caller environment of `envs`, in order (the
   * provider being a separate `rsc` environment), merging what they report
   * into one registry like the hosts do, then generates the production
   * resolver from it and links it to the provider, like the server-fn router.
   * Returns the resolver's `getServerFnById` and the reported ids.
   */
  async function resolverFor(
    envs: 'client' | 'server' | ReadonlyArray<'client' | 'server'>,
    code: string,
  ) {
    const reported: Record<string, ServerFn> = {}
    const options = {
      root: '/test',
      framework: 'react' as const,
      providerEnvName: 'rsc',
      mode: 'build' as const,
      loadModule: async () => {},
      resolveId: async (id: string) => id,
      getKnownServerFns: () => ({}),
    }
    for (const env of typeof envs === 'string' ? [envs] : envs) {
      const caller = new StartCompiler({
        ...options,
        env,
        envName: env === 'client' ? 'client' : 'rsc',
        lookupKinds: getLookupKindsForEnv(env),
        lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
        onServerFnsById: (serverFns) => mergeServerFnsById(reported, serverFns),
      })
      await caller.compile({ code, id: '/test/src/caller.ts' })
    }
    const provider = await new StartCompiler({
      ...options,
      env: 'server',
      envName: 'rsc',
      lookupKinds: getLookupKindsForEnv('server'),
      lookupConfigurations: getLookupConfigurationsForEnv('server', 'react'),
    }).compile({ code, id: '/test/src/caller.ts?tss-serverfn-split' })
    const resolverId = '/test/resolver.js'
    const graph = createServerGraph({
      ssr: undefined,
      provider: provider!.code,
      id: '/test/src/caller.ts',
    })
    graph.add(
      resolverId,
      generateServerFnResolverModule({
        serverFnsById: reported,
        includeClientReferencedCheck: true,
        useStaticImports: true,
      }),
    )
    const { getServerFnById } = await graph.import(resolverId)
    return { getServerFnById, ids: Object.keys(reported) }
  }

  const greet = `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hi')`

  test('a server fn the client compiles is callable from the client', async () => {
    const { getServerFnById, ids } = await resolverFor('client', greet)
    expect(ids).toHaveLength(1)
    const handler = await getServerFnById(ids[0], { origin: 'client' })
    expect(serverFnResult(await handler({}))).toBe('hi')
  })

  // The client and a server caller both report it, in either order: the
  // client's report keeps it callable from the client.
  test.each([
    ['client', 'server'],
    ['server', 'client'],
  ] as const)(
    'a server fn the client and a server caller both compile is callable from the client (%s first)',
    async (...envs) => {
      const { getServerFnById, ids } = await resolverFor(envs, greet)
      expect(ids).toHaveLength(1)
      const handler = await getServerFnById(ids[0], { origin: 'client' })
      expect(serverFnResult(await handler({}))).toBe('hi')
    },
  )
})
