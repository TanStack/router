import { describe, expect, test } from 'vitest'

import { compileServerFnClient, compileServerFnServer } from '../src/compilers'

const clientConfig = {
  root: './test-files',
  filename: 'test.ts',
  getRuntimeCode: () => 'import { createClientRpc } from "my-rpc-lib"',
  replacer: (opts: { filename: string; functionId: string }) =>
    `createClientRpc({
    filename: ${JSON.stringify(opts.filename)},
    functionId: ${JSON.stringify(opts.functionId)},
  })`,
}

const serverConfig = {
  root: './test-files',
  filename: 'test.ts',
}

describe('server function compilation', () => {
  test('basic function declaration', async () => {
    const code = `
      function useServer() {
        'use server'
        return 'hello'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    await expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function useServer(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--useServer"
        })(...args);
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    await expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function useServer(...args) {
        return import("test.ts?tsr-serverfn-split=test--useServer").then(mod => mod.serverFn(...args));
      }"
    `)
  })

  test('arrow function', () => {
    const code = `
      const fn = () => {
        'use server'
        return 'hello'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      const fn = (...args) => {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--fn_1"
        })(...args);
      };"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "const fn = (...args) => {
        return import("test.ts?tsr-serverfn-split=test--fn_1").then(mod => mod.serverFn(...args));
      };"
    `)
  })

  test('anonymous function', () => {
    const code = `
      const anonymousFn = function () {
        'use server'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      const anonymousFn = function (...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--anonymousFn_1"
        })(...args);
      };"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "const anonymousFn = function (...args) {
        return import("test.ts?tsr-serverfn-split=test--anonymousFn_1").then(mod => mod.serverFn(...args));
      };"
    `)
  })

  test('class methods', () => {
    const code = `
      class TestClass {
        method() {
          'use server'
          return 'hello'
        }

        static staticMethod() {
          'use server'
          return 'hello'
        }
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      class TestClass {
        method(...args) {
          return createClientRpc({
            filename: "test.ts",
            functionId: "test--method"
          })(...args);
        }
        static staticMethod(...args) {
          return createClientRpc({
            filename: "test.ts",
            functionId: "test--staticMethod"
          })(...args);
        }
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "class TestClass {
        method(...args) {
          return import("test.ts?tsr-serverfn-split=test--method").then(mod => mod.serverFn(...args));
        }
        static staticMethod(...args) {
          return import("test.ts?tsr-serverfn-split=test--staticMethod").then(mod => mod.serverFn(...args));
        }
      }"
    `)
  })

  test('object methods', () => {
    const code = `
      const obj = {
        method() {
          'use server'
          return 'hello'
        },
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      const obj = {
        method(...args) {
          return createClientRpc({
            filename: "test.ts",
            functionId: "test--obj_method"
          })(...args);
        }
      };"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "const obj = {
        method(...args) {
          return import("test.ts?tsr-serverfn-split=test--obj_method").then(mod => mod.serverFn(...args));
        }
      };"
    `)
  })

  test('async functions', () => {
    const code = `
      async function asyncServer() {
        'use server'
        return 'hello'
      }

      const asyncArrow = async () => {
        'use server'
        return 'hello'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      async function asyncServer(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--asyncServer"
        })(...args);
      }
      const asyncArrow = async (...args) => {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--asyncArrow_1"
        })(...args);
      };"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "async function asyncServer(...args) {
        return import("test.ts?tsr-serverfn-split=test--asyncServer").then(mod => mod.serverFn(...args));
      }
      const asyncArrow = async (...args) => {
        return import("test.ts?tsr-serverfn-split=test--asyncArrow_1").then(mod => mod.serverFn(...args));
      };"
    `)
  })

  test('generator functions', () => {
    const code = `
      function* generatorServer() {
        'use server'
        yield 'hello'
      }

      async function* asyncGeneratorServer() {
        'use server'
        yield 'hello'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function* generatorServer(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--generatorServer"
        })(...args);
      }
      async function* asyncGeneratorServer(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--asyncGeneratorServer"
        })(...args);
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function* generatorServer(...args) {
        return import("test.ts?tsr-serverfn-split=test--generatorServer").then(mod => mod.serverFn(...args));
      }
      async function* asyncGeneratorServer(...args) {
        return import("test.ts?tsr-serverfn-split=test--asyncGeneratorServer").then(mod => mod.serverFn(...args));
      }"
    `)
  })

  test('nested functions', () => {
    const code = `
      function outer() {
        function inner() {
          'use server'
          return 'hello'
        }
        return inner
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function outer() {
        function inner(...args) {
          return createClientRpc({
            filename: "test.ts",
            functionId: "test--outer_inner"
          })(...args);
        }
        return inner;
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function outer() {
        function inner(...args) {
          return import("test.ts?tsr-serverfn-split=test--outer_inner").then(mod => mod.serverFn(...args));
        }
        return inner;
      }"
    `)
  })

  test('multiple directives', () => {
    const code = `
      function multiDirective() {
        'use strict'
        'use server'
        return 'hello'
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function multiDirective(...args) {
        'use strict';

        return createClientRpc({
          filename: "test.ts",
          functionId: "test--multiDirective"
        })(...args);
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function multiDirective(...args) {
        'use strict';

        return import("test.ts?tsr-serverfn-split=test--multiDirective").then(mod => mod.serverFn(...args));
      }"
    `)
  })

  test('function with parameters', () => {
    const code = `
      function withParams(a: string, b: number) {
        'use server'
        return \`\${a} \${b}\`
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function withParams(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--withParams"
        })(...args);
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function withParams(...args) {
        return import("test.ts?tsr-serverfn-split=test--withParams").then(mod => mod.serverFn(...args));
      }"
    `)
  })

  test('IIFE', () => {
    const code = `
      const iife = (function () {
        'use server'
        return 'hello'
      })()
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      const iife = function (...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--iife"
        })(...args);
      }();"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "const iife = function (...args) {
        return import("test.ts?tsr-serverfn-split=test--iife").then(mod => mod.serverFn(...args));
      }();"
    `)
  })

  test('higher order functions', () => {
    const code = `
      function higherOrder() {
        return function () {
          'use server'
          return 'hello'
        }
      }
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function higherOrder() {
        return function (...args) {
          return createClientRpc({
            filename: "test.ts",
            functionId: "test--higherOrder"
          })(...args);
        };
      }"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function higherOrder() {
        return function (...args) {
          return import("test.ts?tsr-serverfn-split=test--higherOrder").then(mod => mod.serverFn(...args));
        };
      }"
    `)
  })

  test('functions that might have the same functionId', () => {
    const code = `
      function main() {
        function middle() {
          const useServer = function () {
            'use server'
            return 'hello'
          }
          return useServer
        }
        return middle
      }

      main().middle(function useServer() {
        'use server'
        return 'hello'
      })
    `

    const client = compileServerFnClient({ ...clientConfig, code })
    expect(client.compiledCode.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib";
      function main() {
        function middle() {
          const useServer = function (...args) {
            return createClientRpc({
              filename: "test.ts",
              functionId: "test--main_middle_useServer_1"
            })(...args);
          };
          return useServer;
        }
        return middle;
      }
      main().middle(function useServer(...args) {
        return createClientRpc({
          filename: "test.ts",
          functionId: "test--main_middle_useServer_2"
        })(...args);
      });"
    `)

    const server = compileServerFnServer({ ...serverConfig, code })
    expect(server.compiledCode.code).toMatchInlineSnapshot(`
      "function main() {
        function middle() {
          const useServer = function (...args) {
            return import("test.ts?tsr-serverfn-split=test--main_middle_useServer_1").then(mod => mod.serverFn(...args));
          };
          return useServer;
        }
        return middle;
      }
      main().middle(function useServer(...args) {
        return import("test.ts?tsr-serverfn-split=test--main_middle_useServer_2").then(mod => mod.serverFn(...args));
      });"
    `)
  })
})
