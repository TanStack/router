import { generateModule } from '@tanstack/router-utils'
import { describe, expect, test } from 'vitest'
import {
  acceptHotUpdates,
  directiveStatement,
  extractedHandler,
  rpcCall,
  runtimeImport,
} from '../src/start-compiler/handleCreateServerFn'
import { envOnlyStub } from '../src/start-compiler/handleEnvOnly'
import { isomorphicStub } from '../src/start-compiler/handleCreateIsomorphicFn'
import type { Node } from '@yuku-toolchain/types'

// The compiler builds these nodes directly; print them to read the code they stand for.
const print = (node: Node) => generateModule(node).code

describe('createServerFn builders', () => {
  test('rpcCall', () => {
    expect(
      print(rpcCall('createClientRpc', 'b6fe31e85836ae6c')),
    ).toMatchInlineSnapshot(`"createClientRpc("b6fe31e85836ae6c")"`)
  })

  test('extractedHandler', () => {
    expect(
      print(
        extractedHandler({
          functionName: 'getUser_createServerFn_handler',
          runtimeName: 'createServerRpc',
          functionId: 'b6fe31e85836ae6c',
          variableName: 'getUser',
          relativeFilename: 'src/routes/user.tsx',
        }),
      ),
    ).toMatchInlineSnapshot(
      `"const getUser_createServerFn_handler = createServerRpc({ "id": "b6fe31e85836ae6c", "name": "getUser", "filename": "src/routes/user.tsx" }, (opts) => getUser.__executeServer(opts));"`,
    )
  })

  test('acceptHotUpdates', () => {
    expect(print(acceptHotUpdates('hot'))).toMatchInlineSnapshot(`
      "if (import.meta.hot) {
        import.meta.hot.accept(() => {});
      }"
    `)
    expect(print(acceptHotUpdates('webpackHot'))).toMatchInlineSnapshot(`
      "if (import.meta.webpackHot) {
        import.meta.webpackHot.accept(() => {});
      }"
    `)
  })

  test('directiveStatement', () => {
    expect(print(directiveStatement('use server'))).toMatchInlineSnapshot(
      `""use server";"`,
    )
  })

  test('runtimeImport', () => {
    expect(
      print(
        runtimeImport(
          'createServerRpc',
          'createServerRpc',
          '@tanstack/react-start/server-rpc',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"import { createServerRpc } from '@tanstack/react-start/server-rpc';"`,
    )
    expect(
      print(
        runtimeImport(
          'createServerRpc',
          'createServerRpc2',
          '@tanstack/react-start/server-rpc',
        ),
      ),
    ).toMatchInlineSnapshot(
      `"import { createServerRpc as createServerRpc2 } from '@tanstack/react-start/server-rpc';"`,
    )
  })
})

describe('environment function builders', () => {
  test('envOnlyStub', () => {
    expect(print(envOnlyStub('createServerOnlyFn', 'server')))
      .toMatchInlineSnapshot(`
      "() => {
        throw new Error("createServerOnlyFn() functions can only be called on the server!");
      }"
    `)
  })

  test('isomorphicStub', () => {
    expect(print(isomorphicStub())).toMatchInlineSnapshot(`"() => {}"`)
  })
})
