import { describe, expect, test } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import type { LookupConfig, LookupKind } from '../../src/start-compiler/compiler'

function createDirectiveCompiler(env: 'client' | 'server') {
  const lookupKinds: Set<LookupKind> = new Set(['ServerFn'])

  const lookupConfigurations: Array<LookupConfig> = [
    {
      libName: '@tanstack/solid-start',
      rootExport: 'createServerFn',
      kind: 'Root',
    },
  ]

  return new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'solid',
    providerEnvName: 'ssr',
    serverFnTransport: 'directive',
    lookupKinds,
    lookupConfigurations,
    getKnownServerFns: () => ({}),
    loadModule: async () => {},
    resolveId: async (id) => id,
    mode: 'build',
  })
}

const code = `
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'

export const myPostFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string() }))
  .handler(async ({ data }) => {
    return { greeting: 'hello ' + data.name }
  })

export const myGetFn = createServerFn({ method: 'GET' }).handler(async () => {
  return secretServerValue
})

const secretServerValue = 'secret'
`

describe('serverFnTransport: directive', () => {
  test('client env emits directive trampolines, strips validator and handler bodies', async () => {
    const compiler = createDirectiveCompiler('client')
    const result = await compiler.compile({ code, id: '/test/src/posts.tsx' })

    expect(result?.code).toMatchInlineSnapshot(`
      "import { createDirectiveClientRpc } from '@tanstack/solid-start/client-rpc';
      import { createServerFn } from '@tanstack/solid-start';
      export const myPostFn = createServerFn({
        method: 'POST'
      }).handler(createDirectiveClientRpc(opts => {
        'use server';

        return myPostFn.__executeServer(opts);
      }, {
        id: "076f92307bf3754bbe037e56349363766566fc371126b25b72eac02fbaa10ce8"
      }));
      export const myGetFn = createServerFn({
        method: 'GET'
      }).handler(createDirectiveClientRpc(opts => {
        'use server';

        return myGetFn.__executeServer(opts);
      }, {
        id: "889d7c24abc6d5a359e5f26892f82ee1de44543e3b6bc4cd9dd6d32ae01aa5a6"
      }));"
    `)

    // No server code may leak into the client bundle
    expect(result?.code).not.toContain('secretServerValue')
    expect(result?.code).not.toContain('zod')
  })

  test('server env keeps validator + original handler and emits normalizing trampolines', async () => {
    const compiler = createDirectiveCompiler('server')
    const result = await compiler.compile({ code, id: '/test/src/posts.tsx' })

    expect(result?.code).toMatchInlineSnapshot(`
      "import { createDirectiveServerRpc, normalizeDirectiveServerOpts } from '@tanstack/solid-start/server-rpc';
      import { createServerFn } from '@tanstack/solid-start';
      import { z } from 'zod';
      export const myPostFn = createServerFn({
        method: 'POST'
      }).validator(z.object({
        name: z.string()
      })).handler(createDirectiveServerRpc(opts => {
        'use server';

        return myPostFn.__executeServer(normalizeDirectiveServerOpts(opts));
      }, {
        id: "076f92307bf3754bbe037e56349363766566fc371126b25b72eac02fbaa10ce8",
        name: "myPostFn",
        filename: "src/posts.tsx"
      }), async ({
        data
      }) => {
        return {
          greeting: 'hello ' + data.name
        };
      });
      export const myGetFn = createServerFn({
        method: 'GET'
      }).handler(createDirectiveServerRpc(opts => {
        'use server';

        return myGetFn.__executeServer(normalizeDirectiveServerOpts(opts));
      }, {
        id: "889d7c24abc6d5a359e5f26892f82ee1de44543e3b6bc4cd9dd6d32ae01aa5a6",
        name: "myGetFn",
        filename: "src/posts.tsx"
      }), async () => {
        return secretServerValue;
      });
      const secretServerValue = 'secret';"
    `)
  })
})
