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
        functionId: "test_ts--namedFunction_wrapper_namedFunction"
      });
      export const namedFunction = wrapper(namedFunction_wrapper_namedFunction);
      const arrowFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--arrowFunction_wrapper"
      });
      export const arrowFunction = wrapper(arrowFunction_wrapper);
      const anonymousFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--anonymousFunction_wrapper"
      });
      export const anonymousFunction = wrapper(anonymousFunction_wrapper);
      const multipleDirectives_multipleDirectives = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--multipleDirectives_multipleDirectives"
      });
      export const multipleDirectives = multipleDirectives_multipleDirectives;
      const iife_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--iife"
      });
      export const iife = iife_1();
      const defaultExportFn_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--defaultExportFn"
      });
      export default defaultExportFn_1;
      const namedExportFn_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--namedExportFn"
      });
      export const namedExportFn = namedExportFn_1;
      const exportedArrowFunction_wrapper = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--exportedArrowFunction_wrapper"
      });
      export const exportedArrowFunction = wrapper(exportedArrowFunction_wrapper);
      const namedExportConst_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--namedExportConst"
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
        functionId: "test_ts--namedFunction_wrapper_namedFunction"
      });
      export const namedFunction = wrapper(namedFunction_wrapper_namedFunction);
      const arrowFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--arrowFunction_wrapper"
      });
      export const arrowFunction = wrapper(arrowFunction_wrapper);
      const anonymousFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--anonymousFunction_wrapper"
      });
      export const anonymousFunction = wrapper(anonymousFunction_wrapper);
      const multipleDirectives_multipleDirectives = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--multipleDirectives_multipleDirectives"
      });
      export const multipleDirectives = multipleDirectives_multipleDirectives;
      const iife_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--iife"
      });
      export const iife = iife_1();
      const defaultExportFn_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--defaultExportFn"
      });
      export default defaultExportFn_1;
      const namedExportFn_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--namedExportFn"
      });
      export const namedExportFn = namedExportFn_1;
      const exportedArrowFunction_wrapper = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--exportedArrowFunction_wrapper"
      });
      export const exportedArrowFunction = wrapper(exportedArrowFunction_wrapper);
      const namedExportConst_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--namedExportConst"
      });
      export const namedExportConst = namedExportConst_1;
      const namedDefaultExport = 'namedDefaultExport';
      export default namedDefaultExport;
      const namedExport = 'namedExport';
      export { namedExport };"
    `)

    expect(splitFiles).toMatchInlineSnapshot(
      `
      "// test_ts--namedFunction_wrapper_namedFunction

      import { createServerRpc } from "my-rpc-lib-server";
      const namedFunction_wrapper_namedFunction = createServerRpc({
        fn: function namedFunction() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_namedFunction_wrapper_namedFunction--namedFunction_wrapper_namedFunction"
      });
      export default namedFunction_wrapper_namedFunction;


      // test_ts--arrowFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const arrowFunction_wrapper = createServerRpc({
        fn: () => {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_arrowFunction_wrapper--arrowFunction_wrapper"
      });
      export default arrowFunction_wrapper;


      // test_ts--anonymousFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const anonymousFunction_wrapper = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_anonymousFunction_wrapper--anonymousFunction_wrapper"
      });
      export default anonymousFunction_wrapper;


      // test_ts--multipleDirectives_multipleDirectives

      import { createServerRpc } from "my-rpc-lib-server";
      const multipleDirectives_multipleDirectives = createServerRpc({
        fn: function multipleDirectives() {
          'use strict';

          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_multipleDirectives_multipleDirectives--multipleDirectives_multipleDirectives"
      });
      export default multipleDirectives_multipleDirectives;


      // test_ts--iife

      import { createServerRpc } from "my-rpc-lib-server";
      const iife_1 = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_iife--iife"
      });
      export default iife_1;


      // test_ts--defaultExportFn

      import { createServerRpc } from "my-rpc-lib-server";
      const defaultExportFn_1 = createServerRpc({
        fn: function defaultExportFn() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_defaultExportFn--defaultExportFn"
      });
      export default defaultExportFn_1;


      // test_ts--namedExportFn

      import { createServerRpc } from "my-rpc-lib-server";
      const namedExportFn_1 = createServerRpc({
        fn: function namedExportFn() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_namedExportFn--namedExportFn"
      });
      export default namedExportFn_1;


      // test_ts--exportedArrowFunction_wrapper

      import { createServerRpc } from "my-rpc-lib-server";
      const exportedArrowFunction_wrapper = createServerRpc({
        fn: () => {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_exportedArrowFunction_wrapper--exportedArrowFunction_wrapper"
      });
      export default exportedArrowFunction_wrapper;


      // test_ts--namedExportConst

      import { createServerRpc } from "my-rpc-lib-server";
      const namedExportConst_1 = createServerRpc({
        fn: () => {
          return usedFn();
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_namedExportConst--namedExportConst"
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

    expect(() => compileDirectives({ ...clientConfig, code })).toThrow()
    expect(() => compileDirectives({ ...serverConfig, code })).toThrow()
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrow()
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

    expect(() => compileDirectives({ ...clientConfig, code })).toThrow()
    expect(() => compileDirectives({ ...serverConfig, code })).toThrow()
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrow()
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

    expect(() => compileDirectives({ ...clientConfig, code })).toThrow()
    expect(() => compileDirectives({ ...serverConfig, code })).toThrow()
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrow()
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

    expect(() => compileDirectives({ ...clientConfig, code })).toThrow()
    expect(() => compileDirectives({ ...serverConfig, code })).toThrow()
    expect(() =>
      compileDirectives({
        ...serverConfig,
        code,
        filename: serverConfig.filename + `?tsr-serverfn-split=temp`,
      }),
    ).toThrow()
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
        functionId: "test_ts--multiDirective"
      });"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from "my-rpc-lib-server";
      createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--multiDirective"
      });"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// test_ts--multiDirective

      import { createServerRpc } from "my-rpc-lib-server";
      createServerRpc({
        fn: function multiDirective() {
          'use strict';

          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_multiDirective--multiDirective"
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
        functionId: "test_ts--iife"
      });
      export const iife = iife_1();"
    `)

    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from "my-rpc-lib-server";
      const iife_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--iife"
      });
      export const iife = iife_1();"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// test_ts--iife

      import { createServerRpc } from "my-rpc-lib-server";
      const iife_1 = createServerRpc({
        fn: function () {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_iife--iife"
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
        functionId: "test_ts--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--outer_useServer_1"
      });
      outer(outer_useServer_1);"
    `)

    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from "my-rpc-lib-server";
      const outer_useServer = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--outer_useServer_1"
      });
      outer(outer_useServer_1);"
    `)

    expect(splitFiles).toMatchInlineSnapshot(`
      "// test_ts--outer_useServer

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: function useServer() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_outer_useServer--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=outer_useServer_1").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_outer_useServer--outer_useServer_1"
      });
      outer(outer_useServer_1);
      export default outer_useServer;


      // test_ts--outer_useServer_1

      import { createServerRpc } from "my-rpc-lib-server";
      const outer_useServer = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=outer_useServer").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_outer_useServer_1--outer_useServer"
      });
      outer(outer_useServer);
      const outer_useServer_1 = createServerRpc({
        fn: function useServer() {
          return 'hello';
        },
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_outer_useServer_1--outer_useServer_1"
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
        functionId: "test_ts--useServer"
      });
      export const useServer = useServer_1;
      const defaultExport_1 = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--defaultExport"
      });
      export default defaultExport_1;"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "'use server';

      import { createSsrRpc } from "my-rpc-lib-server";
      const useServer_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--useServer"
      });
      export const useServer = useServer_1;
      const defaultExport_1 = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--defaultExport"
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
        functionId: "test_ts_tsr-directive-use-server-split_useServer--useServer"
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
        functionId: "test_ts_tsr-directive-use-server-split_defaultExport--defaultExport"
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
        functionId: "test_ts--myServerFn_createServerFn_handler"
      });
      export const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler);
      const myServerFn2_createServerFn_handler = createClientRpc({
        filename: "test.ts",
        functionId: "test_ts--myServerFn2_createServerFn_handler"
      });
      export const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler);"
    `)
    expect(ssr.compiledResult.code).toMatchInlineSnapshot(`
      "import { createSsrRpc } from "my-rpc-lib-server";
      import { createServerFn } from '@tanstack/start';
      const myServerFn_createServerFn_handler = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--myServerFn_createServerFn_handler"
      });
      export const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler);
      const myServerFn2_createServerFn_handler = createSsrRpc({
        filename: "test.ts",
        functionId: "test_ts--myServerFn2_createServerFn_handler"
      });
      export const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler);"
    `)
    expect(splitFiles).toMatchInlineSnapshot(`
      "// test_ts--myServerFn_createServerFn_handler

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
        functionId: "test_ts_tsr-directive-use-server-split_myServerFn_createServerFn_handler--myServerFn_createServerFn_handler"
      });
      const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler, myFunc);
      export default myServerFn_createServerFn_handler;


      // test_ts--myServerFn2_createServerFn_handler

      import { createServerRpc } from "my-rpc-lib-server";
      import { createServerFn } from '@tanstack/start';
      const myFunc = () => {
        return 'hello from the server';
      };
      const myServerFn_createServerFn_handler = createServerRpc({
        fn: (...args) => devImport("test.ts?tsr-directive-use-server-split=myServerFn_createServerFn_handler").then(module => module.default(...args)),
        filename: "test.ts",
        functionId: "test_ts_tsr-directive-use-server-split_myServerFn2_createServerFn_handler--myServerFn_createServerFn_handler"
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
        functionId: "test_ts_tsr-directive-use-server-split_myServerFn2_createServerFn_handler--myServerFn2_createServerFn_handler"
      });
      const myServerFn = createServerFn().handler(myServerFn_createServerFn_handler, myFunc);
      const myServerFn2 = createServerFn().handler(myServerFn2_createServerFn_handler, myFunc2);
      export default myServerFn2_createServerFn_handler;"
    `)
  })
})
