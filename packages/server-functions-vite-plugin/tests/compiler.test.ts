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
  devSplitImporter: `devImport`,
}

const ssrConfig: Omit<CompileDirectivesOpts, 'code'> = {
  directive: 'use server',
  directiveLabel: 'Server function',
  root: './test-files',
  filename: 'test.ts',
  getRuntimeCode: () => 'import { createSsrRpc } from "my-rpc-lib-server"',
  replacer: (opts) =>
    `createSsrRpc({
    filename: ${JSON.stringify(opts.filename)},
    functionId: ${JSON.stringify(opts.functionId)},
  })`,
  devSplitImporter: `devImport`,
}

const serverConfig: Omit<CompileDirectivesOpts, 'code'> = {
  directive: 'use server',
  directiveLabel: 'Server function',
  root: './test-files',
  filename: 'test.ts',
  getRuntimeCode: () => 'import { createServerRpc } from "my-rpc-lib-server"',
  replacer: (opts) =>
    // On the server build, we need different code for the split function
    // vs any other server functions the split function may reference

    // For the split function itself, we use the original function.
    // For any other server functions the split function may reference,
    // we use the splitImportFn which is a dynamic import of the split file.
    `createServerRpc({
    fn: ${opts.isSplitFn ? opts.fn : opts.splitImportFn},
    filename: ${JSON.stringify(opts.filename)},
    functionId: ${JSON.stringify(opts.functionId)},
  })`,
  devSplitImporter: `devImport`,
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
    const ssr = compileDirectives({ ...ssrConfig, code })
    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionId}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFilename,
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
      "import { createSsrRpc } from "my-rpc-lib-server";
      const namedFunction_wrapper_namedFunction = createSsrRpc({
        filename: "test.ts",
        functionId: "test--namedFunction_wrapper_namedFunction"
      });
      export const namedFunction = wrapper(namedFunction_wrapper_namedFunction);
      const arrowFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test--arrowFunction_wrapper"
      });
      export const arrowFunction = wrapper(arrowFunction_wrapper);
      const anonymousFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test--anonymousFunction_wrapper"
      });
      export const anonymousFunction = wrapper(anonymousFunction_wrapper);
      const multipleDirectives_multipleDirectives = createSsrRpc({
        filename: "test.ts",
        functionId: "test--multipleDirectives_multipleDirectives"
      });
      export const multipleDirectives = multipleDirectives_multipleDirectives;
      const iife_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();
      const defaultExportFn_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--defaultExportFn"
      });
      export default defaultExportFn_1;
      const namedExportFn_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--namedExportFn"
      });
      export const namedExportFn = namedExportFn_1;
      const exportedArrowFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test--exportedArrowFunction_wrapper"
      });
      export const exportedArrowFunction = wrapper(exportedArrowFunction_wrapper);
      const namedExportConst_1 = createSsrRpc({
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
      "// test--namedFunction_wrapper_namedFunction

      import { createServerRpc } from "my-rpc-lib-server";
      const namedFunction_wrapper_namedFunction = createServerRpc({
        fn: function namedFunction() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--namedFunction_wrapper_namedFunction"
      });
      export default namedFunction_wrapper_namedFunction;


      // test--arrowFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const arrowFunction_wrapper = createServerRpc({
        fn: () => {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--arrowFunction_wrapper"
      });
      export default arrowFunction_wrapper;


      // test--anonymousFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const anonymousFunction_wrapper = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--anonymousFunction_wrapper"
      });
      export default anonymousFunction_wrapper;


      // test--multipleDirectives_multipleDirectives

      import { createServerRpc } from "my-rpc-lib-server";
      const multipleDirectives_multipleDirectives = createServerRpc({
        fn: function multipleDirectives() {
          'use strict';

          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--multipleDirectives_multipleDirectives"
      });
      export default multipleDirectives_multipleDirectives;


      // test--iife

      import { createServerRpc } from "my-rpc-lib-server";
      const iife_1 = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--iife"
      });
      export default iife_1;


      // test--defaultExportFn

      import { createServerRpc } from "my-rpc-lib-server";
      const defaultExportFn_1 = createServerRpc({
        fn: function defaultExportFn() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--defaultExportFn"
      });
      export default defaultExportFn_1;


      // test--namedExportFn

      import { createServerRpc } from "my-rpc-lib-server";
      const namedExportFn_1 = createServerRpc({
        fn: function namedExportFn() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--namedExportFn"
      });
      export default namedExportFn_1;


      // test--exportedArrowFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const exportedArrowFunction_wrapper = createServerRpc({
        fn: () => {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--exportedArrowFunction_wrapper"
      });
      export default exportedArrowFunction_wrapper;


      // test--namedExportConst

      import { createServerRpc } from "my-rpc-lib-server";
      const namedExportConst_1 = createServerRpc({
        fn: () => {
          return usedFn();
        },
        filename: "test.ts",
        functionId: "test--namedExportConst"
      });
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

  test('multiple directiveFnsById', () => {
    const code = `
      function multiDirective() {
        'use strict'
        'use server'
        return 'hello'
      }
    `

    const client = compileDirectives({ ...clientConfig, code })
    const ssr = compileDirectives({ ...ssrConfig, code })
    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionId}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFilename,
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
      "import { createSsrRpc } from "my-rpc-lib-server";
      createSsrRpc({
        filename: "test.ts",
        functionId: "test--multiDirective"
      });"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// test--multiDirective

      import { createServerRpc } from "my-rpc-lib-server";
      createServerRpc({
        fn: function multiDirective() {
          'use strict';

          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--multiDirective"
      });
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
    const ssr = compileDirectives({ ...ssrConfig, code })
    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionId}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFilename,
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
      "import { createSsrRpc } from "my-rpc-lib-server";
      const iife_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--iife"
      });
      export const iife = iife_1();"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// test--iife

      import { createServerRpc } from "my-rpc-lib-server";
      const iife_1 = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--iife"
      });
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
    const ssr = compileDirectives({ ...ssrConfig, code })

    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionId}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directiveFn.splitFilename,
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
      "import { createSsrRpc } from "my-rpc-lib-server";
      const outer_useServer = createSsrRpc({
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
      outer(outer_useServer_1);"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// test--outer_useServer

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: function useServer() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=test--outer_useServer_1").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
      outer(outer_useServer_1);
      export default outer_useServer;


      // test--outer_useServer_1

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=test--outer_useServer").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: function useServer() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--outer_useServer_1"
      });
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
    const ssr = compileDirectives({ ...ssrConfig, code })
    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directive]) => {
        return `// ${directive.functionName}\n\n${
          compileDirectives({
            ...serverConfig,
            code,
            filename: directive.splitFilename,
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

      import { createSsrRpc } from "my-rpc-lib-server";
      const useServer_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--useServer"
      });
      export const useServer = useServer_1;
      const defaultExport_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test--defaultExport"
      });
      export default defaultExport_1;"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// useServer

      'use server';

      import { createServerRpc } from "my-rpc-lib-server";
      const useServer_1 = createServerRpc({
        fn: function useServer() {
          return usedInUseServer();
        },
        filename: "test.ts",
        functionId: "test--useServer"
      });
      function usedInUseServer() {
        return 'hello';
      }
      export default useServer_1;


      // defaultExport

      'use server';

      import { createServerRpc } from "my-rpc-lib-server";
      const defaultExport_1 = createServerRpc({
        fn: function defaultExport() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test--defaultExport"
      });
      export default defaultExport_1;"
    `)
  })

  test('createServerFn with identifier', () => {
    // The following code is the client output of the tanstack-start-vite-plugin
    // that compiles `createServerFn` calls to automatically add the `use server`
    // directive in the right places.
    const clientOrSsrCode = `import { createServerFn } from '@tanstack/start';
      export const myServerFn = createServerFn().handler(opts => {
        "use server";

        return myServerFn.__executeServer(opts);
      });
      
      export const myServerFn2 = createServerFn().handler(opts => {
        "use server";

        return myServerFn2.__executeServer(opts);
      });`

    // The following code is the server output of the tanstack-start-vite-plugin
    // that compiles `createServerFn` calls to automatically add the `use server`
    // directive in the right places.
    const serverCode = `import { createServerFn } from '@tanstack/start';
      const myFunc = () => {
        return 'hello from the server'
      };
      export const myServerFn = createServerFn().handler(opts => {
        "use server";
        
        return myServerFn.__executeServer(opts);
      }, myFunc);

      const myFunc2 = () => {
        return myServerFn({ data: 'hello 2 from the server' });
      };
      export const myServerFn2 = createServerFn().handler(opts => {
        "use server";

        return myServerFn2.__executeServer(opts);
      }, myFunc2);`

    const client = compileDirectives({ ...clientConfig, code: clientOrSsrCode })
    const ssr = compileDirectives({ ...ssrConfig, code: clientOrSsrCode })
    const splitFiles = Object.entries(ssr.directiveFnsById)
      .map(([_fnId, directiveFn]) => {
        return `// ${directiveFn.functionId}\n\n${
          compileDirectives({
            ...serverConfig,
            code: serverCode,
            filename: directiveFn.splitFilename,
          }).compiledResult.code
        }`
      })
      .join('\n\n\n')

    expect(client.compiledResult.code).toMatchInlineSnapshot(`
      "import { createClientRpc } from "my-rpc-lib-client";
      import { createServerFn } from '@tanstack/start';
      const myServerFn_createServerFn_handler = createClientRpc({
        filename: "test.ts",
        functionId: "test--myServerFn_createServerFn_handler"
      });
      export const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler);
      const myServerFn2_createServerFn_handler = createClientRpc({
        filename: "test.ts",
        functionId: "test--myServerFn2_createServerFn_handler"
      });
      export const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler);"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from "my-rpc-lib-server";
      import { createServerFn } from '@tanstack/start';
      const myServerFn_createServerFn_handler = createSsrRpc({
        filename: "test.ts",
        functionId: "test--myServerFn_createServerFn_handler"
      });
      export const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler);
      const myServerFn2_createServerFn_handler = createSsrRpc({
        filename: "test.ts",
        functionId: "test--myServerFn2_createServerFn_handler"
      });
      export const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler);"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// test--myServerFn_createServerFn_handler

      import { createServerRpc } from "my-rpc-lib-server";
      import { createServerFn } from '@tanstack/start';
      const myFunc = () => {
        return 'hello from the server';
      };
      const myServerFn_createServerFn_handler = createServerRpc({
        fn: opts => {
          return myServerFn.__executeServer(opts);
        },
        filename: "test.ts",
        functionId: "test--myServerFn_createServerFn_handler"
      });
      const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler, myFunc);
      export default myServerFn_createServerFn_handler;


      // test--myServerFn2_createServerFn_handler

      import { createServerRpc } from "my-rpc-lib-server";
      import { createServerFn } from '@tanstack/start';
      const myFunc = () => {
        return 'hello from the server';
      };
      const myServerFn_createServerFn_handler = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=test--myServerFn_createServerFn_handler").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test--myServerFn_createServerFn_handler"
      });
      const myFunc2 = () => {
        return myServerFn({
          data: 'hello 2 from the server'
        });
      };
      const myServerFn2_createServerFn_handler = createServerRpc({
        fn: opts => {
          return myServerFn2.__executeServer(opts);
        },
        filename: "test.ts",
        functionId: "test--myServerFn2_createServerFn_handler"
      });
      const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler, myFunc);
      const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler, myFunc2);
      export default myServerFn2_createServerFn_handler;"
    `)
  })
})
