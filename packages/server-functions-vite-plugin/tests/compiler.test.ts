import { describe, expect, test } from 'vitest'

import { compileDirectives } from '../src/compilers'
import type { CompileDirectivesOpts } from '../src/compilers'

const clientConfig: Omit<CompileDirectivesOpts, 'code'> = {
  directive: 'use server',
  directiveLabel: 'Server function',
  root: './test-files',
  filename: 'test.ts',
  getRuntimeCode: () => 'import { createClientRpc } from "my-rpc-lib-client"',
  replacer: (opts) =>
    `createClientRpc({
    filename: ${JSON.stringify(opts.filename)},
    functionId: ${JSON.stringify(opts.functionId)},
  })`,
}

const serverConfig: Omit<CompileDirectivesOpts, 'code'> = {
  directive: 'use server',
  directiveLabel: 'Server function',
  root: './test-files',
  filename: 'test.ts',
  getRuntimeCode: () => 'import { createServerRpc } from "my-rpc-lib-server"',
  replacer: (opts) =>
    `createServerRpc({
    fn: ${opts.splitImportFn},
    filename: ${JSON.stringify(opts.filename)},
    functionId: ${JSON.stringify(opts.functionId)},
  })`,
}

describe('server function compilation', () => {
  const code = `
      export const namedFunction = wrapper(function namedFunction() {
        'use server'
        return 'hello'
      })

      export const arrowFunction = wrapper(() => {
        'use server'
        return 'hello'
      })

      export const anonymousFunction = wrapper(function () {
        'use server'
        return 'hello'
      })

      export const multipleDirectives = function multipleDirectives() {
        'use server'
        'use strict'
        return 'hello'
      }

      export const iife = (function () {
        'use server'
        return 'hello'
      })()

      export default function defaultExportFn() {
        'use server'
        return 'hello'
      }

      export function namedExportFn() {
        'use server'
        return 'hello'
      }

      export const exportedArrowFunction = wrapper(() => {
        'use server'
        return 'hello'
      })

      export const namedExportConst = () => {
        'use server'
        return usedFn()
      }

      function usedFn() {
        return 'hello'
      }

      function unusedFn() {
        return 'hello'
      }

      const namedDefaultExport = 'namedDefaultExport'
      export default namedDefaultExport

      const usedButNotExported = 'usedButNotExported'
      
      const namedExport = 'namedExport'

      export {
        namedExport
      }

    `

  test('basic function declaration nested in other variable', () => {
    const client = compileDirectives({
      ...clientConfig,
      code,
    })
    const ssr = compileDirectives({ ...serverConfig, code })
    const splitFiles = Object.entries(ssr.directives)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFileId,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib-client";
      const namedFunction_wrapper_namedFunction = createClientRpc({
        filename: "test.ts",
        functionId: "test--namedFunction_wrapper_namedFunction"
      });
      export const namedFunction = wrapper(namedFunction_wrapper_namedFunction);
      const arrowFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test--arrowFunction_wrapper"
      });
      export const arrowFunction = wrapper(arrowFunction_wrapper);
      const anonymousFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test--anonymousFunction_wrapper"
      });
      export const anonymousFunction = wrapper(anonymousFunction_wrapper);
      const multipleDirectives_multipleDirectives = createClientRpc({
        filename: "test.ts",
        functionId: "test--multipleDirectives_multipleDirectives"
      });
      export const multipleDirectives = multipleDirectives_multipleDirectives;
      const iife_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();
      const defaultExportFn_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--defaultExportFn"
      });
      export default defaultExportFn_1;
      const namedExportFn_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--namedExportFn"
      });
      export const namedExportFn = namedExportFn_1;
      const exportedArrowFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test--exportedArrowFunction_wrapper"
      });
      export const exportedArrowFunction = wrapper(exportedArrowFunction_wrapper);
      const namedExportConst_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--namedExportConst"
      });
      export const namedExportConst = namedExportConst_1;
      const namedDefaultExport = 'namedDefaultExport';
      export default namedDefaultExport;
      const namedExport = 'namedExport';
      export { namedExport };"
    `)

    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from "my-rpc-lib-server";
      const namedFunction_wrapper_namedFunction = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--namedFunction_wrapper_namedFunction").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--namedFunction_wrapper_namedFunction"
      });
      export const namedFunction = wrapper(namedFunction_wrapper_namedFunction);
      const arrowFunction_wrapper = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--arrowFunction_wrapper").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--arrowFunction_wrapper"
      });
      export const arrowFunction = wrapper(arrowFunction_wrapper);
      const anonymousFunction_wrapper = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--anonymousFunction_wrapper").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--anonymousFunction_wrapper"
      });
      export const anonymousFunction = wrapper(anonymousFunction_wrapper);
      const multipleDirectives_multipleDirectives = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--multipleDirectives_multipleDirectives").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--multipleDirectives_multipleDirectives"
      });
      export const multipleDirectives = multipleDirectives_multipleDirectives;
      const iife_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--iife").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();
      const defaultExportFn_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--defaultExportFn").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--defaultExportFn"
      });
      export default defaultExportFn_1;
      const namedExportFn_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--namedExportFn").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--namedExportFn"
      });
      export const namedExportFn = namedExportFn_1;
      const exportedArrowFunction_wrapper = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--exportedArrowFunction_wrapper").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--exportedArrowFunction_wrapper"
      });
      export const exportedArrowFunction = wrapper(exportedArrowFunction_wrapper);
      const namedExportConst_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--namedExportConst").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--namedExportConst"
      });
      export const namedExportConst = namedExportConst_1;
      const namedDefaultExport = 'namedDefaultExport';
      export default namedDefaultExport;
      const namedExport = 'namedExport';
      export { namedExport };"
    `)

    expect(splitFiles).toMatchInlineSnapshot(
      `
      "// namedFunction_wrapper_namedFunction

      const namedFunction_wrapper_namedFunction = function namedFunction() {
        return 'hello';
      };
      export default namedFunction_wrapper_namedFunction;


      // arrowFunction_wrapper

      const arrowFunction_wrapper = () => {
        return 'hello';
      };
      export default arrowFunction_wrapper;


      // anonymousFunction_wrapper

      const anonymousFunction_wrapper = function () {
        return 'hello';
      };
      export default anonymousFunction_wrapper;


      // multipleDirectives_multipleDirectives

      const multipleDirectives_multipleDirectives = function multipleDirectives() {
        'use strict';

        return 'hello';
      };
      export default multipleDirectives_multipleDirectives;


      // iife

      const iife_1 = function () {
        return 'hello';
      };
      export default iife_1;


      // defaultExportFn

      const defaultExportFn_1 = function defaultExportFn() {
        return 'hello';
      };
      export default defaultExportFn_1;


      // namedExportFn

      const namedExportFn_1 = function namedExportFn() {
        return 'hello';
      };
      export default namedExportFn_1;


      // exportedArrowFunction_wrapper

      const exportedArrowFunction_wrapper = () => {
        return 'hello';
      };
      export default exportedArrowFunction_wrapper;


      // namedExportConst

      const namedExportConst_1 = () => {
        return usedFn();
      };
      function usedFn() {
        return 'hello';
      }
      export default namedExportConst_1;"
    `,
    )
  })

  test('Does not support function declarations nested in other blocks', () => {
    const code = `
      outer(() => {
        function useServer() {
          'use server'
          return 'hello'
        }
      })
    `

    expect(() =>
      compileDirectives({ ...clientConfig, code }),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error:   1 |
      > 2 |       outer(() => {
          |                  ^^
      > 3 |         function useServer() {
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 4 |           'use server'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 5 |           return 'hello'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 6 |         }
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 7 |       })
          | ^^^^^^^ Server functions cannot be nested in other blocks or functions
        8 |     ]
    `,
    )
    expect(() =>
      compileDirectives({ ...serverConfig, code }),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error:   1 |
      > 2 |       outer(() => {
          |                  ^^
      > 3 |         function useServer() {
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 4 |           'use server'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 5 |           return 'hello'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 6 |         }
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 7 |       })
          | ^^^^^^^ Server functions cannot be nested in other blocks or functions
        8 |     ]
    `,
    )
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error:   1 |
      > 2 |       outer(() => {
          |                  ^^
      > 3 |         function useServer() {
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 4 |           'use server'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 5 |           return 'hello'
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 6 |         }
          | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 7 |       })
          | ^^^^^^^ Server functions cannot be nested in other blocks or functions
        8 |     ]
    `,
    )
  })

  test('does not support class methods', () => {
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

    expect(() => compileDirectives({ ...clientConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
          2 |       class TestClass {
        > 3 |         method() {
            |        ^^^^^^^^^^^
        > 4 |           'use server'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 5 |           return 'hello'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 6 |         }
            | ^^^^^^^^^ "use server" in class not supported
          7 |
          8 |         static staticMethod() {
          9 |           'use server']
      `)
    expect(() => compileDirectives({ ...serverConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
          2 |       class TestClass {
        > 3 |         method() {
            |        ^^^^^^^^^^^
        > 4 |           'use server'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 5 |           return 'hello'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 6 |         }
            | ^^^^^^^^^ "use server" in class not supported
          7 |
          8 |         static staticMethod() {
          9 |           'use server']
      `)
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error:   1 |
        2 |       class TestClass {
      > 3 |         method() {
          |        ^^^^^^^^^^^
      > 4 |           'use server'
          | ^^^^^^^^^^^^^^^^^^^^^^
      > 5 |           return 'hello'
          | ^^^^^^^^^^^^^^^^^^^^^^
      > 6 |         }
          | ^^^^^^^^^ "use server" in class not supported
        7 |
        8 |         static staticMethod() {
        9 |           'use server']
    `)
  })

  test('does not support object methods', () => {
    const code = `
      const obj = {
        method() {
          'use server'
          return 'hello'
        },
      }
    `

    expect(() => compileDirectives({ ...clientConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
          2 |       const obj = {
        > 3 |         method() {
            |        ^^^^^^^^^^^
        > 4 |           'use server'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 5 |           return 'hello'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 6 |         },
            | ^^^^^^^^^ "use server" in object method not supported
          7 |       }
          8 |     ]
      `)
    expect(() => compileDirectives({ ...serverConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
          2 |       const obj = {
        > 3 |         method() {
            |        ^^^^^^^^^^^
        > 4 |           'use server'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 5 |           return 'hello'
            | ^^^^^^^^^^^^^^^^^^^^^^
        > 6 |         },
            | ^^^^^^^^^ "use server" in object method not supported
          7 |       }
          8 |     ]
      `)
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error:   1 |
        2 |       const obj = {
      > 3 |         method() {
          |        ^^^^^^^^^^^
      > 4 |           'use server'
          | ^^^^^^^^^^^^^^^^^^^^^^
      > 5 |           return 'hello'
          | ^^^^^^^^^^^^^^^^^^^^^^
      > 6 |         },
          | ^^^^^^^^^ "use server" in object method not supported
        7 |       }
        8 |     ]
    `)
  })

  test('does not support generator functions', () => {
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

    expect(() => compileDirectives({ ...clientConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
        > 2 |       function* generatorServer() {
            |      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        > 3 |         'use server'
            | ^^^^^^^^^^^^^^^^^^^^
        > 4 |         yield 'hello'
            | ^^^^^^^^^^^^^^^^^^^^
        > 5 |       }
            | ^^^^^^^ "use server" in generator function not supported
          6 |
          7 |       async function* asyncGeneratorServer() {
          8 |         'use server']
      `)
    expect(() => compileDirectives({ ...serverConfig, code }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error:   1 |
        > 2 |       function* generatorServer() {
            |      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        > 3 |         'use server'
            | ^^^^^^^^^^^^^^^^^^^^
        > 4 |         yield 'hello'
            | ^^^^^^^^^^^^^^^^^^^^
        > 5 |       }
            | ^^^^^^^ "use server" in generator function not supported
          6 |
          7 |       async function* asyncGeneratorServer() {
          8 |         'use server']
      `)
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error:   1 |
      > 2 |       function* generatorServer() {
          |      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      > 3 |         'use server'
          | ^^^^^^^^^^^^^^^^^^^^
      > 4 |         yield 'hello'
          | ^^^^^^^^^^^^^^^^^^^^
      > 5 |       }
          | ^^^^^^^ "use server" in generator function not supported
        6 |
        7 |       async function* asyncGeneratorServer() {
        8 |         'use server']
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

    const client = compileDirectives({ ...clientConfig, code })
    const ssr = compileDirectives({ ...serverConfig, code })
    const splitFiles = Object.entries(ssr.directives)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFileId,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib-client";
      createClientRpc({
        filename: "test.ts",
        functionId: "test--multiDirective"
      });"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from "my-rpc-lib-server";
      createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--multiDirective").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--multiDirective"
      });"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// multiDirective

      export default multiDirective_1;"
    `)
  })

  test('IIFE', () => {
    const code = `
      export const iife = (function () {
        'use server'
        return 'hello'
      })()
    `

    const client = compileDirectives({ ...clientConfig, code })
    const ssr = compileDirectives({ ...serverConfig, code })
    const splitFiles = Object.entries(ssr.directives)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFileId,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib-client";
      const iife_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();"
    `)

    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from "my-rpc-lib-server";
      const iife_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--iife").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// iife

      const iife_1 = function () {
        return 'hello';
      };
      export default iife_1;"
    `)
  })

  test('functions that might have the same functionId', () => {
    const code = `
      outer(function useServer() {
        'use server'
        return 'hello'
      })

      outer(function useServer() {
        'use server'
        return 'hello'
      })
    `

    const client = compileDirectives({ ...clientConfig, code })
    const ssr = compileDirectives({ ...serverConfig, code })

    const splitFiles = Object.entries(ssr.directives)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFileId,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib-client";
      const outer_useServer = createClientRpc({
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
      outer(outer_useServer_1);"
    `)

    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--outer_useServer").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--outer_useServer_1").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
      outer(outer_useServer_1);"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// outer_useServer

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = function useServer() {
        return 'hello';
      };
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--outer_useServer_1").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
      outer(outer_useServer_1);
      export default outer_useServer;


      // outer_useServer

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--outer_useServer").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = function useServer() {
        return 'hello';
      };
      outer(outer_useServer_1);
      export default outer_useServer_1;"
    `)
  })

  test('use server directive in program body', () => {
    const code = `
      'use server'

      export function useServer() {
        return usedInUseServer()
      }

      function notExported() {
        return 'hello'
      }

      function usedInUseServer() {
        return 'hello'
      }

      export default function defaultExport() {
        return 'hello'
      }
    `

    const client = compileDirectives({ ...clientConfig, code })
    const ssr = compileDirectives({ ...serverConfig, code })
    const splitFiles = Object.entries(ssr.directives)
      .map(([_fnId, directive]) => {
        return `// ${directive.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directive.splitFileId,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "'use server';

      import { createClientRpc } from "my-rpc-lib-client";
      const useServer_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--useServer"
      });
      export const useServer = useServer_1;
      const defaultExport_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test--defaultExport"
      });
      export default defaultExport_1;"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "'use server';

      import { createServerRpc } from "my-rpc-lib-server";
      const useServer_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--useServer").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--useServer"
      });
      export const useServer = useServer_1;
      const defaultExport_1 = createServerRpc({
        fn: (...args) => import("test.ts?tsr-directive-use-server-split=test--defaultExport").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--defaultExport"
      });
      export default defaultExport_1;"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// useServer

      'use server';

      const useServer_1 = function useServer() {
        return usedInUseServer();
      };
      function usedInUseServer() {
        return 'hello';
      }
      export default useServer_1;


      // defaultExport

      'use server';

      const defaultExport_1 = function defaultExport() {
        return 'hello';
      };
      export default defaultExport_1;"
    `)
  })
})
