/**
 * The production server-fn resolver (`getServerFnById`, generated from what
 * the callers reported) observed by evaluating it: which handler each id
 * runs, and who may call it (SPEC J4.2, D6). Error prose is free (§5.7).
 */
import { describe, expect, test } from 'vitest'
import { expectDeterministic } from '@tanstack/compiler-test-utils/determinism'
import { generateServerFnResolverModule } from '../src/start-compiler/server-fn-resolver-module'
import type { ServerFn } from '../src/start-compiler/types'

/** A provider module (a `data:` URL) whose export `name` returns `value`. */
const providerModule = (name: string, value: string) =>
  `data:text/javascript,${encodeURIComponent(`export const ${name} = () => ${JSON.stringify(value)}`)}`

/** A reported server fn whose handler returns its id. */
const serverFn = (id: string, isClientReferenced = true): ServerFn => ({
  functionName: `${id}Fn`,
  functionId: id,
  filename: `/app/${id}.ts`,
  extractedFilename: providerModule(`${id}Fn`, `ran ${id}`),
  isClientReferenced,
})

/** Generates the resolver for `serverFnsById` and imports it. */
async function resolverOf(
  serverFnsById: Record<string, ServerFn>,
  useStaticImports = false,
) {
  const source = generateServerFnResolverModule({
    serverFnsById,
    includeClientReferencedCheck: true,
    memoizeModules: true,
    useStaticImports,
  })
  const { getServerFnById } = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`
  )
  return getServerFnById as (
    id: string,
    access: { origin: 'client' | 'server' },
  ) => Promise<() => unknown>
}

/** What a call by `id` from `origin` gives: the handler's result, or a rejection. */
async function callById(
  getServerFnById: Awaited<ReturnType<typeof resolverOf>>,
  id: string,
  origin: 'client' | 'server',
) {
  return getServerFnById(id, { origin }).then(
    (handler) => handler(),
    () => 'rejected',
  )
}

describe('generateServerFnResolverModule', () => {
  test.each([false, true])(
    'resolves each id to its handler; only client-referenced ones are callable from the client (static imports: %s)',
    async (useStaticImports) => {
      const getServerFnById = await resolverOf(
        {
          fn_a: serverFn('fn_a'),
          fn_private: serverFn('fn_private', false),
        },
        useStaticImports,
      )
      expect({
        public: {
          client: await callById(getServerFnById, 'fn_a', 'client'),
          server: await callById(getServerFnById, 'fn_a', 'server'),
        },
        private: {
          client: await callById(getServerFnById, 'fn_private', 'client'),
          server: await callById(getServerFnById, 'fn_private', 'server'),
        },
        unknown: await callById(getServerFnById, 'missing', 'server'),
      }).toEqual({
        public: { client: 'ran fn_a', server: 'ran fn_a' },
        private: { client: 'rejected', server: 'ran fn_private' },
        unknown: 'rejected',
      })
    },
  )

  // Server fns are discovered in whatever order the bundler compiles the
  // modules; the resolver must not depend on it (G4): every id runs the same
  // handler under the same access policy.
  test('resolves the same handlers whatever order the server fns were discovered in', async () => {
    const ids = ['b', 'c', 'a', 'd']
    const orders = [
      ids,
      [...ids].reverse(),
      ['a', 'b', 'c', 'd'],
      ['c', 'a', 'd', 'b'],
    ]
    await expectDeterministic(orders, async (order) => {
      const getServerFnById = await resolverOf(
        Object.fromEntries(order.map((id) => [id, serverFn(id, id !== 'c')])),
      )
      const results: Record<string, unknown> = {}
      for (const id of [...ids].sort()) {
        results[id] = {
          client: await callById(getServerFnById, id, 'client'),
          server: await callById(getServerFnById, id, 'server'),
        }
      }
      return results
    })
  })
})
