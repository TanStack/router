import { generateModule } from '@tanstack/router-utils'
import { b } from 'yuku-ast'
import { describe, expect, test } from 'vitest'
import {
  createServerFnCaller,
  createServerFnExports,
  createServerFnHmr,
  createServerFnImport,
  createServerFnProvider,
} from '../../src/start-compiler/serverFnAst'
import type { ProgramStatement } from '@yuku-toolchain/types'

function print(...body: Array<ProgramStatement>) {
  return generateModule(
    b.Program({ sourceType: 'module', hashbang: null, body }),
  ).code
}

describe('server function AST builders', () => {
  test('client and SSR callers', () => {
    expect(
      print(
        ...['createClientRpc', 'createSsrRpc'].map((runtimeName) =>
          b.ExpressionStatement({
            expression: createServerFnCaller(runtimeName, 'function-id'),
          }),
        ),
      ),
    ).toMatchInlineSnapshot(`
      "createClientRpc("function-id");
      createSsrRpc("function-id");"
    `)
  })

  test('provider metadata and execution callback', () => {
    expect(
      print(
        createServerFnProvider({
          runtimeName: 'createServerRpc',
          functionName: 'getUser_createServerFn_handler',
          functionId: 'function-id',
          variableName: 'getUser',
          relativeFilename: 'src/users.ts',
        }),
      ),
    ).toMatchInlineSnapshot(
      `"const getUser_createServerFn_handler = createServerRpc({ "id": "function-id", "name": "getUser", "filename": "src/users.ts" }, (opts) => getUser.__executeServer(opts));"`,
    )
  })

  test('escapes IDs and filenames without changing identifier names', () => {
    expect(
      print(
        createServerFnProvider({
          runtimeName: 'createServerRpc',
          functionName: 'πfn_createServerFn_handler',
          functionId: 'quote"\\\n\r\t\0',
          variableName: 'πfn',
          relativeFilename: 'src/"quoted"\\file.ts',
        }),
        b.ExpressionStatement({
          expression: createServerFnCaller(
            'createClientRpc',
            'quote"\\\n\r\t\0',
          ),
        }),
      ),
    ).toMatchInlineSnapshot(`
      "const πfn_createServerFn_handler = createServerRpc({ "id": "quote\\"\\\\\\n\\r\\t\\0", "name": "πfn", "filename": "src/\\"quoted\\"\\\\file.ts" }, (opts) => πfn.__executeServer(opts));
      createClientRpc("quote\\"\\\\\\n\\r\\t\\0");"
    `)
  })

  test('exports provider handlers in insertion order', () => {
    expect(
      print(
        createServerFnExports(new Set(['second_handler', 'first_handler'])),
      ),
    ).toMatchInlineSnapshot(`"export { second_handler, first_handler };"`)
  })

  test('guards both Vite and webpack HMR acceptance', () => {
    expect(print(...createServerFnHmr())).toMatchInlineSnapshot(`
      "if (import.meta.hot) {
        import.meta.hot.accept(() => {});
      }
      if (import.meta.webpackHot) {
        import.meta.webpackHot.accept(() => {});
      }"
    `)
  })

  test('react runtime imports', () => {
    expect(
      print(
        createServerFnImport('createClientRpc', 'react', 'client-rpc'),
        createServerFnImport('createSsrRpc', 'react', 'ssr-rpc'),
        createServerFnImport('createServerRpc', 'react', 'server-rpc'),
      ),
    ).toMatchInlineSnapshot(`
      "import { createClientRpc } from '@tanstack/react-start/client-rpc';
      import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
      import { createServerRpc } from '@tanstack/react-start/server-rpc';"
    `)
  })

  test('solid runtime imports', () => {
    expect(
      print(
        createServerFnImport('createClientRpc', 'solid', 'client-rpc'),
        createServerFnImport('createSsrRpc', 'solid', 'ssr-rpc'),
        createServerFnImport('createServerRpc', 'solid', 'server-rpc'),
      ),
    ).toMatchInlineSnapshot(`
      "import { createClientRpc } from '@tanstack/solid-start/client-rpc';
      import { createSsrRpc } from '@tanstack/solid-start/ssr-rpc';
      import { createServerRpc } from '@tanstack/solid-start/server-rpc';"
    `)
  })

  test('vue runtime imports', () => {
    expect(
      print(
        createServerFnImport('createClientRpc', 'vue', 'client-rpc'),
        createServerFnImport('createSsrRpc', 'vue', 'ssr-rpc'),
        createServerFnImport('createServerRpc', 'vue', 'server-rpc'),
      ),
    ).toMatchInlineSnapshot(`
      "import { createClientRpc } from '@tanstack/vue-start/client-rpc';
      import { createSsrRpc } from '@tanstack/vue-start/ssr-rpc';
      import { createServerRpc } from '@tanstack/vue-start/server-rpc';"
    `)
  })
})
