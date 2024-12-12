import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, test } from 'vitest'

import { parse } from '@babel/parser'
import { deadCodeElimination } from 'babel-dead-code-elimination'
import generate from '@babel/generator'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitVirtualRoute,
} from '../src/core/code-splitter/compilers'
import { splitPrefix } from '../src/core/constants'
import type { ParseResult } from '@babel/parser'

async function getFilenames() {
  return await readdir(path.resolve(__dirname, './code-splitter/test-files'))
}

describe('code-splitter works', async () => {
  const filenames = await getFilenames()

  it.each(filenames)(
    'should handle the compiling of "%s"',
    async (filename) => {
      const file = await readFile(
        path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
      )
      const code = file.toString()

      const compileResult = compileCodeSplitReferenceRoute({
        code,
        root: './code-splitter/test-files',
        filename,
      })

      await expect(compileResult.code).toMatchFileSnapshot(
        `./code-splitter/snapshots/${filename}`,
      )
    },
  )

  it.each(filenames)(
    'should handle the splitting of "%s"',
    async (filename) => {
      const file = await readFile(
        path.resolve(__dirname, `./code-splitter/test-files/${filename}`),
      )
      const code = file.toString()

      const splitResult = compileCodeSplitVirtualRoute({
        code: code,
        root: './code-splitter/test-files',
        filename: `${filename}?${splitPrefix}`,
      })

      await expect(splitResult.code).toMatchFileSnapshot(
        `./code-splitter/snapshots/${filename.replace('.tsx', '')}@split.tsx`,
      )
    },
  )

  test('deadcode elimination gut check', async () => {
    const source = `
    import { Outlet, createFileRoute } from '@tanstack/react-router';
    import { Scarf } from '~/components/Scarf';
    import { getLibrary } from '~/libraries';
    import { seo } from '~/utils/seo';
    import { Route } from "/Users/tannerlinsley/GitHub/tanstack.com/app/routes/$libraryId/route.tsx";
    export default function RouteForm() {
      const {
        libraryId
      } = Route.useParams();
      const library = getLibrary(libraryId);
      return <>
          <Outlet />
          {library.scarfId ? <Scarf id={library.scarfId} /> : null}
        </>;
    }
    const component = function RouteForm() {
      const {
        libraryId
      } = Route.useParams();
      const library = getLibrary(libraryId);
      return <>
          <Outlet />
          {library.scarfId ? <Scarf id={library.scarfId} /> : null}
        </>;
    };
    export { component };
  `

    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })

    deadCodeElimination(ast)

    expect(await generate(ast).code).toMatchInlineSnapshot(`
      "import { Outlet } from '@tanstack/react-router';
      import { Scarf } from '~/components/Scarf';
      import { getLibrary } from '~/libraries';
      import { Route } from "/Users/tannerlinsley/GitHub/tanstack.com/app/routes/$libraryId/route.tsx";
      export default function RouteForm() {
        const {
          libraryId
        } = Route.useParams();
        const library = getLibrary(libraryId);
        return <>
                <Outlet />
                {library.scarfId ? <Scarf id={library.scarfId} /> : null}
              </>;
      }
      const component = function RouteForm() {
        const {
          libraryId
        } = Route.useParams();
        const library = getLibrary(libraryId);
        return <>
                <Outlet />
                {library.scarfId ? <Scarf id={library.scarfId} /> : null}
              </>;
      };
      export { component };"
    `)
  })

  test('deadcode elimination gut check 2', async () => {
    const ast = getAst() as ParseResult<any>

    deadCodeElimination(ast)

    expect(
      await generate(ast, {
        sourceMaps: true,
      }).code,
    ).toMatchInlineSnapshot(`
      "import { Outlet } from '@tanstack/react-router';
      import { Scarf } from '~/components/Scarf';
      import { getLibrary } from '~/libraries';
      import { Route } from "/Users/tannerlinsley/GitHub/tanstack.com/app/routes/$libraryId/route.tsx";
      export default function RouteForm() {
        const {
          libraryId
        } = Route.useParams();
        const library = getLibrary(libraryId);
        return <>
            <Outlet />
            {library.scarfId ? <Scarf id={library.scarfId} /> : null}
          </>;
      }
      const component = function RouteForm() {
        const {
          libraryId
        } = Route.useParams();
        const library = getLibrary(libraryId);
        return <>
            <Outlet />
            {library.scarfId ? <Scarf id={library.scarfId} /> : null}
          </>;
      };
      export { component };"
    `)
  })
})

function getAst() {
  return {
    type: 'File',
    start: 0,
    end: 1051,
    loc: {
      start: {
        line: 1,
        column: 0,
        index: 0,
      },
      end: {
        line: 41,
        column: 0,
        index: 1051,
      },
    },
    errors: [],
    program: {
      type: 'Program',
      start: 0,
      end: 1051,
      loc: {
        start: {
          line: 1,
          column: 0,
          index: 0,
        },
        end: {
          line: 41,
          column: 0,
          index: 1051,
        },
      },
      sourceType: 'module',
      interpreter: null,
      body: [
        {
          type: 'ImportDeclaration',
          start: 0,
          end: 64,
          loc: {
            start: {
              line: 1,
              column: 0,
              index: 0,
            },
            end: {
              line: 1,
              column: 64,
              index: 64,
            },
          },
          importKind: 'value',
          specifiers: [
            {
              type: 'ImportSpecifier',
              start: 9,
              end: 15,
              loc: {
                start: {
                  line: 1,
                  column: 9,
                  index: 9,
                },
                end: {
                  line: 1,
                  column: 15,
                  index: 15,
                },
              },
              imported: {
                type: 'Identifier',
                start: 9,
                end: 15,
                loc: {
                  start: {
                    line: 1,
                    column: 9,
                    index: 9,
                  },
                  end: {
                    line: 1,
                    column: 15,
                    index: 15,
                  },
                  identifierName: 'Outlet',
                },
                name: 'Outlet',
              },
              importKind: 'value',
              local: {
                type: 'Identifier',
                start: 9,
                end: 15,
                loc: {
                  start: {
                    line: 1,
                    column: 9,
                    index: 9,
                  },
                  end: {
                    line: 1,
                    column: 15,
                    index: 15,
                  },
                  identifierName: 'Outlet',
                },
                name: 'Outlet',
              },
            },
            {
              type: 'ImportSpecifier',
              start: 17,
              end: 32,
              loc: {
                start: {
                  line: 1,
                  column: 17,
                  index: 17,
                },
                end: {
                  line: 1,
                  column: 32,
                  index: 32,
                },
              },
              imported: {
                type: 'Identifier',
                start: 17,
                end: 32,
                loc: {
                  start: {
                    line: 1,
                    column: 17,
                    index: 17,
                  },
                  end: {
                    line: 1,
                    column: 32,
                    index: 32,
                  },
                  identifierName: 'createFileRoute',
                },
                name: 'createFileRoute',
              },
              importKind: 'value',
              local: {
                type: 'Identifier',
                start: 17,
                end: 32,
                loc: {
                  start: {
                    line: 1,
                    column: 17,
                    index: 17,
                  },
                  end: {
                    line: 1,
                    column: 32,
                    index: 32,
                  },
                  identifierName: 'createFileRoute',
                },
                name: 'createFileRoute',
              },
            },
          ],
          source: {
            type: 'StringLiteral',
            start: 40,
            end: 64,
            loc: {
              start: {
                line: 1,
                column: 40,
                index: 40,
              },
              end: {
                line: 1,
                column: 64,
                index: 64,
              },
            },
            extra: {
              rawValue: '@tanstack/react-router',
              raw: "'@tanstack/react-router'",
            },
            value: '@tanstack/react-router',
          },
          attributes: [],
        },
        {
          type: 'ImportDeclaration',
          start: 65,
          end: 107,
          loc: {
            start: {
              line: 2,
              column: 0,
              index: 65,
            },
            end: {
              line: 2,
              column: 42,
              index: 107,
            },
          },
          importKind: 'value',
          specifiers: [
            {
              type: 'ImportSpecifier',
              start: 74,
              end: 79,
              loc: {
                start: {
                  line: 2,
                  column: 9,
                  index: 74,
                },
                end: {
                  line: 2,
                  column: 14,
                  index: 79,
                },
              },
              imported: {
                type: 'Identifier',
                start: 74,
                end: 79,
                loc: {
                  start: {
                    line: 2,
                    column: 9,
                    index: 74,
                  },
                  end: {
                    line: 2,
                    column: 14,
                    index: 79,
                  },
                  identifierName: 'Scarf',
                },
                name: 'Scarf',
              },
              importKind: 'value',
              local: {
                type: 'Identifier',
                start: 74,
                end: 79,
                loc: {
                  start: {
                    line: 2,
                    column: 9,
                    index: 74,
                  },
                  end: {
                    line: 2,
                    column: 14,
                    index: 79,
                  },
                  identifierName: 'Scarf',
                },
                name: 'Scarf',
              },
            },
          ],
          source: {
            type: 'StringLiteral',
            start: 87,
            end: 107,
            loc: {
              start: {
                line: 2,
                column: 22,
                index: 87,
              },
              end: {
                line: 2,
                column: 42,
                index: 107,
              },
            },
            extra: {
              rawValue: '~/components/Scarf',
              raw: "'~/components/Scarf'",
            },
            value: '~/components/Scarf',
          },
          attributes: [],
        },
        {
          type: 'ImportDeclaration',
          start: 108,
          end: 148,
          loc: {
            start: {
              line: 3,
              column: 0,
              index: 108,
            },
            end: {
              line: 3,
              column: 40,
              index: 148,
            },
          },
          importKind: 'value',
          specifiers: [
            {
              type: 'ImportSpecifier',
              start: 117,
              end: 127,
              loc: {
                start: {
                  line: 3,
                  column: 9,
                  index: 117,
                },
                end: {
                  line: 3,
                  column: 19,
                  index: 127,
                },
              },
              imported: {
                type: 'Identifier',
                start: 117,
                end: 127,
                loc: {
                  start: {
                    line: 3,
                    column: 9,
                    index: 117,
                  },
                  end: {
                    line: 3,
                    column: 19,
                    index: 127,
                  },
                  identifierName: 'getLibrary',
                },
                name: 'getLibrary',
              },
              importKind: 'value',
              local: {
                type: 'Identifier',
                start: 117,
                end: 127,
                loc: {
                  start: {
                    line: 3,
                    column: 9,
                    index: 117,
                  },
                  end: {
                    line: 3,
                    column: 19,
                    index: 127,
                  },
                  identifierName: 'getLibrary',
                },
                name: 'getLibrary',
              },
            },
          ],
          source: {
            type: 'StringLiteral',
            start: 135,
            end: 148,
            loc: {
              start: {
                line: 3,
                column: 27,
                index: 135,
              },
              end: {
                line: 3,
                column: 40,
                index: 148,
              },
            },
            extra: {
              rawValue: '~/libraries',
              raw: "'~/libraries'",
            },
            value: '~/libraries',
          },
          attributes: [],
        },
        {
          type: 'ImportDeclaration',
          start: 149,
          end: 182,
          loc: {
            start: {
              line: 4,
              column: 0,
              index: 149,
            },
            end: {
              line: 4,
              column: 33,
              index: 182,
            },
          },
          importKind: 'value',
          specifiers: [
            {
              type: 'ImportSpecifier',
              start: 158,
              end: 161,
              loc: {
                start: {
                  line: 4,
                  column: 9,
                  index: 158,
                },
                end: {
                  line: 4,
                  column: 12,
                  index: 161,
                },
              },
              imported: {
                type: 'Identifier',
                start: 158,
                end: 161,
                loc: {
                  start: {
                    line: 4,
                    column: 9,
                    index: 158,
                  },
                  end: {
                    line: 4,
                    column: 12,
                    index: 161,
                  },
                  identifierName: 'seo',
                },
                name: 'seo',
              },
              importKind: 'value',
              local: {
                type: 'Identifier',
                start: 158,
                end: 161,
                loc: {
                  start: {
                    line: 4,
                    column: 9,
                    index: 158,
                  },
                  end: {
                    line: 4,
                    column: 12,
                    index: 161,
                  },
                  identifierName: 'seo',
                },
                name: 'seo',
              },
            },
          ],
          source: {
            type: 'StringLiteral',
            start: 169,
            end: 182,
            loc: {
              start: {
                line: 4,
                column: 20,
                index: 169,
              },
              end: {
                line: 4,
                column: 33,
                index: 182,
              },
            },
            extra: {
              rawValue: '~/utils/seo',
              raw: "'~/utils/seo'",
            },
            value: '~/utils/seo',
          },
          attributes: [],
        },
        {
          type: 'ImportDeclaration',
          specifiers: [
            {
              type: 'ImportSpecifier',
              local: {
                type: 'Identifier',
                name: 'Route',
              },
              imported: {
                type: 'Identifier',
                name: 'Route',
              },
            },
          ],
          source: {
            type: 'StringLiteral',
            value:
              '/Users/tannerlinsley/GitHub/tanstack.com/app/routes/$libraryId/route.tsx',
          },
          trailingComments: [],
          leadingComments: [],
          innerComments: [],
        },
        {
          type: 'ExportDefaultDeclaration',
          start: 817,
          end: 1050,
          loc: {
            start: {
              line: 30,
              column: 0,
              index: 817,
            },
            end: {
              line: 40,
              column: 1,
              index: 1050,
            },
          },
          exportKind: 'value',
          declaration: {
            type: 'FunctionDeclaration',
            start: 832,
            end: 1050,
            loc: {
              start: {
                line: 30,
                column: 15,
                index: 832,
              },
              end: {
                line: 40,
                column: 1,
                index: 1050,
              },
            },
            id: {
              type: 'Identifier',
              start: 841,
              end: 850,
              loc: {
                start: {
                  line: 30,
                  column: 24,
                  index: 841,
                },
                end: {
                  line: 30,
                  column: 33,
                  index: 850,
                },
                identifierName: 'RouteForm',
              },
              name: 'RouteForm',
            },
            generator: false,
            async: false,
            params: [],
            body: {
              type: 'BlockStatement',
              start: 853,
              end: 1050,
              loc: {
                start: {
                  line: 30,
                  column: 36,
                  index: 853,
                },
                end: {
                  line: 40,
                  column: 1,
                  index: 1050,
                },
              },
              body: [
                {
                  type: 'VariableDeclaration',
                  start: 857,
                  end: 896,
                  loc: {
                    start: {
                      line: 31,
                      column: 2,
                      index: 857,
                    },
                    end: {
                      line: 31,
                      column: 41,
                      index: 896,
                    },
                  },
                  declarations: [
                    {
                      type: 'VariableDeclarator',
                      start: 863,
                      end: 896,
                      loc: {
                        start: {
                          line: 31,
                          column: 8,
                          index: 863,
                        },
                        end: {
                          line: 31,
                          column: 41,
                          index: 896,
                        },
                      },
                      id: {
                        type: 'ObjectPattern',
                        start: 863,
                        end: 876,
                        loc: {
                          start: {
                            line: 31,
                            column: 8,
                            index: 863,
                          },
                          end: {
                            line: 31,
                            column: 21,
                            index: 876,
                          },
                        },
                        properties: [
                          {
                            type: 'ObjectProperty',
                            start: 865,
                            end: 874,
                            loc: {
                              start: {
                                line: 31,
                                column: 10,
                                index: 865,
                              },
                              end: {
                                line: 31,
                                column: 19,
                                index: 874,
                              },
                            },
                            key: {
                              type: 'Identifier',
                              start: 865,
                              end: 874,
                              loc: {
                                start: {
                                  line: 31,
                                  column: 10,
                                  index: 865,
                                },
                                end: {
                                  line: 31,
                                  column: 19,
                                  index: 874,
                                },
                                identifierName: 'libraryId',
                              },
                              name: 'libraryId',
                            },
                            computed: false,
                            method: false,
                            shorthand: true,
                            value: {
                              type: 'Identifier',
                              start: 865,
                              end: 874,
                              loc: {
                                start: {
                                  line: 31,
                                  column: 10,
                                  index: 865,
                                },
                                end: {
                                  line: 31,
                                  column: 19,
                                  index: 874,
                                },
                                identifierName: 'libraryId',
                              },
                              name: 'libraryId',
                            },
                            extra: {
                              shorthand: true,
                            },
                          },
                        ],
                      },
                      init: {
                        type: 'CallExpression',
                        start: 879,
                        end: 896,
                        loc: {
                          start: {
                            line: 31,
                            column: 24,
                            index: 879,
                          },
                          end: {
                            line: 31,
                            column: 41,
                            index: 896,
                          },
                        },
                        callee: {
                          type: 'MemberExpression',
                          start: 879,
                          end: 894,
                          loc: {
                            start: {
                              line: 31,
                              column: 24,
                              index: 879,
                            },
                            end: {
                              line: 31,
                              column: 39,
                              index: 894,
                            },
                          },
                          object: {
                            type: 'Identifier',
                            start: 879,
                            end: 884,
                            loc: {
                              start: {
                                line: 31,
                                column: 24,
                                index: 879,
                              },
                              end: {
                                line: 31,
                                column: 29,
                                index: 884,
                              },
                              identifierName: 'Route',
                            },
                            name: 'Route',
                          },
                          computed: false,
                          property: {
                            type: 'Identifier',
                            start: 885,
                            end: 894,
                            loc: {
                              start: {
                                line: 31,
                                column: 30,
                                index: 885,
                              },
                              end: {
                                line: 31,
                                column: 39,
                                index: 894,
                              },
                              identifierName: 'useParams',
                            },
                            name: 'useParams',
                          },
                        },
                        arguments: [],
                      },
                    },
                  ],
                  kind: 'const',
                },
                {
                  type: 'VariableDeclaration',
                  start: 899,
                  end: 936,
                  loc: {
                    start: {
                      line: 32,
                      column: 2,
                      index: 899,
                    },
                    end: {
                      line: 32,
                      column: 39,
                      index: 936,
                    },
                  },
                  declarations: [
                    {
                      type: 'VariableDeclarator',
                      start: 905,
                      end: 936,
                      loc: {
                        start: {
                          line: 32,
                          column: 8,
                          index: 905,
                        },
                        end: {
                          line: 32,
                          column: 39,
                          index: 936,
                        },
                      },
                      id: {
                        type: 'Identifier',
                        start: 905,
                        end: 912,
                        loc: {
                          start: {
                            line: 32,
                            column: 8,
                            index: 905,
                          },
                          end: {
                            line: 32,
                            column: 15,
                            index: 912,
                          },
                          identifierName: 'library',
                        },
                        name: 'library',
                      },
                      init: {
                        type: 'CallExpression',
                        start: 915,
                        end: 936,
                        loc: {
                          start: {
                            line: 32,
                            column: 18,
                            index: 915,
                          },
                          end: {
                            line: 32,
                            column: 39,
                            index: 936,
                          },
                        },
                        callee: {
                          type: 'Identifier',
                          start: 915,
                          end: 925,
                          loc: {
                            start: {
                              line: 32,
                              column: 18,
                              index: 915,
                            },
                            end: {
                              line: 32,
                              column: 28,
                              index: 925,
                            },
                            identifierName: 'getLibrary',
                          },
                          name: 'getLibrary',
                        },
                        arguments: [
                          {
                            type: 'Identifier',
                            start: 926,
                            end: 935,
                            loc: {
                              start: {
                                line: 32,
                                column: 29,
                                index: 926,
                              },
                              end: {
                                line: 32,
                                column: 38,
                                index: 935,
                              },
                              identifierName: 'libraryId',
                            },
                            name: 'libraryId',
                          },
                        ],
                      },
                    },
                  ],
                  kind: 'const',
                },
                {
                  type: 'ReturnStatement',
                  start: 940,
                  end: 1048,
                  loc: {
                    start: {
                      line: 34,
                      column: 2,
                      index: 940,
                    },
                    end: {
                      line: 39,
                      column: 3,
                      index: 1048,
                    },
                  },
                  argument: {
                    type: 'JSXFragment',
                    start: 953,
                    end: 1044,
                    loc: {
                      start: {
                        line: 35,
                        column: 4,
                        index: 953,
                      },
                      end: {
                        line: 38,
                        column: 7,
                        index: 1044,
                      },
                    },
                    openingFragment: {
                      type: 'JSXOpeningFragment',
                      start: 953,
                      end: 955,
                      loc: {
                        start: {
                          line: 35,
                          column: 4,
                          index: 953,
                        },
                        end: {
                          line: 35,
                          column: 6,
                          index: 955,
                        },
                      },
                    },
                    closingFragment: {
                      type: 'JSXClosingFragment',
                      start: 1041,
                      end: 1044,
                      loc: {
                        start: {
                          line: 38,
                          column: 4,
                          index: 1041,
                        },
                        end: {
                          line: 38,
                          column: 7,
                          index: 1044,
                        },
                      },
                    },
                    children: [
                      {
                        type: 'JSXText',
                        start: 955,
                        end: 962,
                        loc: {
                          start: {
                            line: 35,
                            column: 6,
                            index: 955,
                          },
                          end: {
                            line: 36,
                            column: 6,
                            index: 962,
                          },
                        },
                        extra: {
                          rawValue: '\n      ',
                          raw: '\n      ',
                        },
                        value: '\n      ',
                      },
                      {
                        type: 'JSXElement',
                        start: 962,
                        end: 972,
                        loc: {
                          start: {
                            line: 36,
                            column: 6,
                            index: 962,
                          },
                          end: {
                            line: 36,
                            column: 16,
                            index: 972,
                          },
                        },
                        openingElement: {
                          type: 'JSXOpeningElement',
                          start: 962,
                          end: 972,
                          loc: {
                            start: {
                              line: 36,
                              column: 6,
                              index: 962,
                            },
                            end: {
                              line: 36,
                              column: 16,
                              index: 972,
                            },
                          },
                          name: {
                            type: 'JSXIdentifier',
                            start: 963,
                            end: 969,
                            loc: {
                              start: {
                                line: 36,
                                column: 7,
                                index: 963,
                              },
                              end: {
                                line: 36,
                                column: 13,
                                index: 969,
                              },
                            },
                            name: 'Outlet',
                          },
                          attributes: [],
                          selfClosing: true,
                        },
                        closingElement: null,
                        children: [],
                      },
                      {
                        type: 'JSXText',
                        start: 972,
                        end: 979,
                        loc: {
                          start: {
                            line: 36,
                            column: 16,
                            index: 972,
                          },
                          end: {
                            line: 37,
                            column: 6,
                            index: 979,
                          },
                        },
                        extra: {
                          rawValue: '\n      ',
                          raw: '\n      ',
                        },
                        value: '\n      ',
                      },
                      {
                        type: 'JSXExpressionContainer',
                        start: 979,
                        end: 1036,
                        loc: {
                          start: {
                            line: 37,
                            column: 6,
                            index: 979,
                          },
                          end: {
                            line: 37,
                            column: 63,
                            index: 1036,
                          },
                        },
                        expression: {
                          type: 'ConditionalExpression',
                          start: 980,
                          end: 1035,
                          loc: {
                            start: {
                              line: 37,
                              column: 7,
                              index: 980,
                            },
                            end: {
                              line: 37,
                              column: 62,
                              index: 1035,
                            },
                          },
                          test: {
                            type: 'MemberExpression',
                            start: 980,
                            end: 995,
                            loc: {
                              start: {
                                line: 37,
                                column: 7,
                                index: 980,
                              },
                              end: {
                                line: 37,
                                column: 22,
                                index: 995,
                              },
                            },
                            object: {
                              type: 'Identifier',
                              start: 980,
                              end: 987,
                              loc: {
                                start: {
                                  line: 37,
                                  column: 7,
                                  index: 980,
                                },
                                end: {
                                  line: 37,
                                  column: 14,
                                  index: 987,
                                },
                                identifierName: 'library',
                              },
                              name: 'library',
                            },
                            computed: false,
                            property: {
                              type: 'Identifier',
                              start: 988,
                              end: 995,
                              loc: {
                                start: {
                                  line: 37,
                                  column: 15,
                                  index: 988,
                                },
                                end: {
                                  line: 37,
                                  column: 22,
                                  index: 995,
                                },
                                identifierName: 'scarfId',
                              },
                              name: 'scarfId',
                            },
                          },
                          consequent: {
                            type: 'JSXElement',
                            start: 998,
                            end: 1028,
                            loc: {
                              start: {
                                line: 37,
                                column: 25,
                                index: 998,
                              },
                              end: {
                                line: 37,
                                column: 55,
                                index: 1028,
                              },
                            },
                            openingElement: {
                              type: 'JSXOpeningElement',
                              start: 998,
                              end: 1028,
                              loc: {
                                start: {
                                  line: 37,
                                  column: 25,
                                  index: 998,
                                },
                                end: {
                                  line: 37,
                                  column: 55,
                                  index: 1028,
                                },
                              },
                              name: {
                                type: 'JSXIdentifier',
                                start: 999,
                                end: 1004,
                                loc: {
                                  start: {
                                    line: 37,
                                    column: 26,
                                    index: 999,
                                  },
                                  end: {
                                    line: 37,
                                    column: 31,
                                    index: 1004,
                                  },
                                },
                                name: 'Scarf',
                              },
                              attributes: [
                                {
                                  type: 'JSXAttribute',
                                  start: 1005,
                                  end: 1025,
                                  loc: {
                                    start: {
                                      line: 37,
                                      column: 32,
                                      index: 1005,
                                    },
                                    end: {
                                      line: 37,
                                      column: 52,
                                      index: 1025,
                                    },
                                  },
                                  name: {
                                    type: 'JSXIdentifier',
                                    start: 1005,
                                    end: 1007,
                                    loc: {
                                      start: {
                                        line: 37,
                                        column: 32,
                                        index: 1005,
                                      },
                                      end: {
                                        line: 37,
                                        column: 34,
                                        index: 1007,
                                      },
                                    },
                                    name: 'id',
                                  },
                                  value: {
                                    type: 'JSXExpressionContainer',
                                    start: 1008,
                                    end: 1025,
                                    loc: {
                                      start: {
                                        line: 37,
                                        column: 35,
                                        index: 1008,
                                      },
                                      end: {
                                        line: 37,
                                        column: 52,
                                        index: 1025,
                                      },
                                    },
                                    expression: {
                                      type: 'MemberExpression',
                                      start: 1009,
                                      end: 1024,
                                      loc: {
                                        start: {
                                          line: 37,
                                          column: 36,
                                          index: 1009,
                                        },
                                        end: {
                                          line: 37,
                                          column: 51,
                                          index: 1024,
                                        },
                                      },
                                      object: {
                                        type: 'Identifier',
                                        start: 1009,
                                        end: 1016,
                                        loc: {
                                          start: {
                                            line: 37,
                                            column: 36,
                                            index: 1009,
                                          },
                                          end: {
                                            line: 37,
                                            column: 43,
                                            index: 1016,
                                          },
                                          identifierName: 'library',
                                        },
                                        name: 'library',
                                      },
                                      computed: false,
                                      property: {
                                        type: 'Identifier',
                                        start: 1017,
                                        end: 1024,
                                        loc: {
                                          start: {
                                            line: 37,
                                            column: 44,
                                            index: 1017,
                                          },
                                          end: {
                                            line: 37,
                                            column: 51,
                                            index: 1024,
                                          },
                                          identifierName: 'scarfId',
                                        },
                                        name: 'scarfId',
                                      },
                                    },
                                  },
                                },
                              ],
                              selfClosing: true,
                            },
                            closingElement: null,
                            children: [],
                          },
                          alternate: {
                            type: 'NullLiteral',
                            start: 1031,
                            end: 1035,
                            loc: {
                              start: {
                                line: 37,
                                column: 58,
                                index: 1031,
                              },
                              end: {
                                line: 37,
                                column: 62,
                                index: 1035,
                              },
                            },
                          },
                        },
                      },
                      {
                        type: 'JSXText',
                        start: 1036,
                        end: 1041,
                        loc: {
                          start: {
                            line: 37,
                            column: 63,
                            index: 1036,
                          },
                          end: {
                            line: 38,
                            column: 4,
                            index: 1041,
                          },
                        },
                        extra: {
                          rawValue: '\n    ',
                          raw: '\n    ',
                        },
                        value: '\n    ',
                      },
                    ],
                    extra: {
                      parenthesized: true,
                      parenStart: 947,
                    },
                  },
                },
              ],
              directives: [],
            },
          },
        },
        {
          type: 'VariableDeclaration',
          kind: 'const',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: {
                type: 'Identifier',
                name: 'component',
              },
              init: {
                type: 'FunctionExpression',
                id: {
                  type: 'Identifier',
                  start: 841,
                  end: 850,
                  loc: {
                    start: {
                      line: 30,
                      column: 24,
                      index: 841,
                    },
                    end: {
                      line: 30,
                      column: 33,
                      index: 850,
                    },
                    identifierName: 'RouteForm',
                  },
                  name: 'RouteForm',
                },
                params: [],
                body: {
                  type: 'BlockStatement',
                  start: 853,
                  end: 1050,
                  loc: {
                    start: {
                      line: 30,
                      column: 36,
                      index: 853,
                    },
                    end: {
                      line: 40,
                      column: 1,
                      index: 1050,
                    },
                  },
                  body: [
                    {
                      type: 'VariableDeclaration',
                      start: 857,
                      end: 896,
                      loc: {
                        start: {
                          line: 31,
                          column: 2,
                          index: 857,
                        },
                        end: {
                          line: 31,
                          column: 41,
                          index: 896,
                        },
                      },
                      declarations: [
                        {
                          type: 'VariableDeclarator',
                          start: 863,
                          end: 896,
                          loc: {
                            start: {
                              line: 31,
                              column: 8,
                              index: 863,
                            },
                            end: {
                              line: 31,
                              column: 41,
                              index: 896,
                            },
                          },
                          id: {
                            type: 'ObjectPattern',
                            start: 863,
                            end: 876,
                            loc: {
                              start: {
                                line: 31,
                                column: 8,
                                index: 863,
                              },
                              end: {
                                line: 31,
                                column: 21,
                                index: 876,
                              },
                            },
                            properties: [
                              {
                                type: 'ObjectProperty',
                                start: 865,
                                end: 874,
                                loc: {
                                  start: {
                                    line: 31,
                                    column: 10,
                                    index: 865,
                                  },
                                  end: {
                                    line: 31,
                                    column: 19,
                                    index: 874,
                                  },
                                },
                                key: {
                                  type: 'Identifier',
                                  start: 865,
                                  end: 874,
                                  loc: {
                                    start: {
                                      line: 31,
                                      column: 10,
                                      index: 865,
                                    },
                                    end: {
                                      line: 31,
                                      column: 19,
                                      index: 874,
                                    },
                                    identifierName: 'libraryId',
                                  },
                                  name: 'libraryId',
                                },
                                computed: false,
                                method: false,
                                shorthand: true,
                                value: {
                                  type: 'Identifier',
                                  start: 865,
                                  end: 874,
                                  loc: {
                                    start: {
                                      line: 31,
                                      column: 10,
                                      index: 865,
                                    },
                                    end: {
                                      line: 31,
                                      column: 19,
                                      index: 874,
                                    },
                                    identifierName: 'libraryId',
                                  },
                                  name: 'libraryId',
                                },
                                extra: {
                                  shorthand: true,
                                },
                              },
                            ],
                          },
                          init: {
                            type: 'CallExpression',
                            start: 879,
                            end: 896,
                            loc: {
                              start: {
                                line: 31,
                                column: 24,
                                index: 879,
                              },
                              end: {
                                line: 31,
                                column: 41,
                                index: 896,
                              },
                            },
                            callee: {
                              type: 'MemberExpression',
                              start: 879,
                              end: 894,
                              loc: {
                                start: {
                                  line: 31,
                                  column: 24,
                                  index: 879,
                                },
                                end: {
                                  line: 31,
                                  column: 39,
                                  index: 894,
                                },
                              },
                              object: {
                                type: 'Identifier',
                                start: 879,
                                end: 884,
                                loc: {
                                  start: {
                                    line: 31,
                                    column: 24,
                                    index: 879,
                                  },
                                  end: {
                                    line: 31,
                                    column: 29,
                                    index: 884,
                                  },
                                  identifierName: 'Route',
                                },
                                name: 'Route',
                              },
                              computed: false,
                              property: {
                                type: 'Identifier',
                                start: 885,
                                end: 894,
                                loc: {
                                  start: {
                                    line: 31,
                                    column: 30,
                                    index: 885,
                                  },
                                  end: {
                                    line: 31,
                                    column: 39,
                                    index: 894,
                                  },
                                  identifierName: 'useParams',
                                },
                                name: 'useParams',
                              },
                            },
                            arguments: [],
                          },
                        },
                      ],
                      kind: 'const',
                    },
                    {
                      type: 'VariableDeclaration',
                      start: 899,
                      end: 936,
                      loc: {
                        start: {
                          line: 32,
                          column: 2,
                          index: 899,
                        },
                        end: {
                          line: 32,
                          column: 39,
                          index: 936,
                        },
                      },
                      declarations: [
                        {
                          type: 'VariableDeclarator',
                          start: 905,
                          end: 936,
                          loc: {
                            start: {
                              line: 32,
                              column: 8,
                              index: 905,
                            },
                            end: {
                              line: 32,
                              column: 39,
                              index: 936,
                            },
                          },
                          id: {
                            type: 'Identifier',
                            start: 905,
                            end: 912,
                            loc: {
                              start: {
                                line: 32,
                                column: 8,
                                index: 905,
                              },
                              end: {
                                line: 32,
                                column: 15,
                                index: 912,
                              },
                              identifierName: 'library',
                            },
                            name: 'library',
                          },
                          init: {
                            type: 'CallExpression',
                            start: 915,
                            end: 936,
                            loc: {
                              start: {
                                line: 32,
                                column: 18,
                                index: 915,
                              },
                              end: {
                                line: 32,
                                column: 39,
                                index: 936,
                              },
                            },
                            callee: {
                              type: 'Identifier',
                              start: 915,
                              end: 925,
                              loc: {
                                start: {
                                  line: 32,
                                  column: 18,
                                  index: 915,
                                },
                                end: {
                                  line: 32,
                                  column: 28,
                                  index: 925,
                                },
                                identifierName: 'getLibrary',
                              },
                              name: 'getLibrary',
                            },
                            arguments: [
                              {
                                type: 'Identifier',
                                start: 926,
                                end: 935,
                                loc: {
                                  start: {
                                    line: 32,
                                    column: 29,
                                    index: 926,
                                  },
                                  end: {
                                    line: 32,
                                    column: 38,
                                    index: 935,
                                  },
                                  identifierName: 'libraryId',
                                },
                                name: 'libraryId',
                              },
                            ],
                          },
                        },
                      ],
                      kind: 'const',
                    },
                    {
                      type: 'ReturnStatement',
                      start: 940,
                      end: 1048,
                      loc: {
                        start: {
                          line: 34,
                          column: 2,
                          index: 940,
                        },
                        end: {
                          line: 39,
                          column: 3,
                          index: 1048,
                        },
                      },
                      argument: {
                        type: 'JSXFragment',
                        start: 953,
                        end: 1044,
                        loc: {
                          start: {
                            line: 35,
                            column: 4,
                            index: 953,
                          },
                          end: {
                            line: 38,
                            column: 7,
                            index: 1044,
                          },
                        },
                        openingFragment: {
                          type: 'JSXOpeningFragment',
                          start: 953,
                          end: 955,
                          loc: {
                            start: {
                              line: 35,
                              column: 4,
                              index: 953,
                            },
                            end: {
                              line: 35,
                              column: 6,
                              index: 955,
                            },
                          },
                        },
                        closingFragment: {
                          type: 'JSXClosingFragment',
                          start: 1041,
                          end: 1044,
                          loc: {
                            start: {
                              line: 38,
                              column: 4,
                              index: 1041,
                            },
                            end: {
                              line: 38,
                              column: 7,
                              index: 1044,
                            },
                          },
                        },
                        children: [
                          {
                            type: 'JSXText',
                            start: 955,
                            end: 962,
                            loc: {
                              start: {
                                line: 35,
                                column: 6,
                                index: 955,
                              },
                              end: {
                                line: 36,
                                column: 6,
                                index: 962,
                              },
                            },
                            extra: {
                              rawValue: '\n      ',
                              raw: '\n      ',
                            },
                            value: '\n      ',
                          },
                          {
                            type: 'JSXElement',
                            start: 962,
                            end: 972,
                            loc: {
                              start: {
                                line: 36,
                                column: 6,
                                index: 962,
                              },
                              end: {
                                line: 36,
                                column: 16,
                                index: 972,
                              },
                            },
                            openingElement: {
                              type: 'JSXOpeningElement',
                              start: 962,
                              end: 972,
                              loc: {
                                start: {
                                  line: 36,
                                  column: 6,
                                  index: 962,
                                },
                                end: {
                                  line: 36,
                                  column: 16,
                                  index: 972,
                                },
                              },
                              name: {
                                type: 'JSXIdentifier',
                                start: 963,
                                end: 969,
                                loc: {
                                  start: {
                                    line: 36,
                                    column: 7,
                                    index: 963,
                                  },
                                  end: {
                                    line: 36,
                                    column: 13,
                                    index: 969,
                                  },
                                },
                                name: 'Outlet',
                              },
                              attributes: [],
                              selfClosing: true,
                            },
                            closingElement: null,
                            children: [],
                          },
                          {
                            type: 'JSXText',
                            start: 972,
                            end: 979,
                            loc: {
                              start: {
                                line: 36,
                                column: 16,
                                index: 972,
                              },
                              end: {
                                line: 37,
                                column: 6,
                                index: 979,
                              },
                            },
                            extra: {
                              rawValue: '\n      ',
                              raw: '\n      ',
                            },
                            value: '\n      ',
                          },
                          {
                            type: 'JSXExpressionContainer',
                            start: 979,
                            end: 1036,
                            loc: {
                              start: {
                                line: 37,
                                column: 6,
                                index: 979,
                              },
                              end: {
                                line: 37,
                                column: 63,
                                index: 1036,
                              },
                            },
                            expression: {
                              type: 'ConditionalExpression',
                              start: 980,
                              end: 1035,
                              loc: {
                                start: {
                                  line: 37,
                                  column: 7,
                                  index: 980,
                                },
                                end: {
                                  line: 37,
                                  column: 62,
                                  index: 1035,
                                },
                              },
                              test: {
                                type: 'MemberExpression',
                                start: 980,
                                end: 995,
                                loc: {
                                  start: {
                                    line: 37,
                                    column: 7,
                                    index: 980,
                                  },
                                  end: {
                                    line: 37,
                                    column: 22,
                                    index: 995,
                                  },
                                },
                                object: {
                                  type: 'Identifier',
                                  start: 980,
                                  end: 987,
                                  loc: {
                                    start: {
                                      line: 37,
                                      column: 7,
                                      index: 980,
                                    },
                                    end: {
                                      line: 37,
                                      column: 14,
                                      index: 987,
                                    },
                                    identifierName: 'library',
                                  },
                                  name: 'library',
                                },
                                computed: false,
                                property: {
                                  type: 'Identifier',
                                  start: 988,
                                  end: 995,
                                  loc: {
                                    start: {
                                      line: 37,
                                      column: 15,
                                      index: 988,
                                    },
                                    end: {
                                      line: 37,
                                      column: 22,
                                      index: 995,
                                    },
                                    identifierName: 'scarfId',
                                  },
                                  name: 'scarfId',
                                },
                              },
                              consequent: {
                                type: 'JSXElement',
                                start: 998,
                                end: 1028,
                                loc: {
                                  start: {
                                    line: 37,
                                    column: 25,
                                    index: 998,
                                  },
                                  end: {
                                    line: 37,
                                    column: 55,
                                    index: 1028,
                                  },
                                },
                                openingElement: {
                                  type: 'JSXOpeningElement',
                                  start: 998,
                                  end: 1028,
                                  loc: {
                                    start: {
                                      line: 37,
                                      column: 25,
                                      index: 998,
                                    },
                                    end: {
                                      line: 37,
                                      column: 55,
                                      index: 1028,
                                    },
                                  },
                                  name: {
                                    type: 'JSXIdentifier',
                                    start: 999,
                                    end: 1004,
                                    loc: {
                                      start: {
                                        line: 37,
                                        column: 26,
                                        index: 999,
                                      },
                                      end: {
                                        line: 37,
                                        column: 31,
                                        index: 1004,
                                      },
                                    },
                                    name: 'Scarf',
                                  },
                                  attributes: [
                                    {
                                      type: 'JSXAttribute',
                                      start: 1005,
                                      end: 1025,
                                      loc: {
                                        start: {
                                          line: 37,
                                          column: 32,
                                          index: 1005,
                                        },
                                        end: {
                                          line: 37,
                                          column: 52,
                                          index: 1025,
                                        },
                                      },
                                      name: {
                                        type: 'JSXIdentifier',
                                        start: 1005,
                                        end: 1007,
                                        loc: {
                                          start: {
                                            line: 37,
                                            column: 32,
                                            index: 1005,
                                          },
                                          end: {
                                            line: 37,
                                            column: 34,
                                            index: 1007,
                                          },
                                        },
                                        name: 'id',
                                      },
                                      value: {
                                        type: 'JSXExpressionContainer',
                                        start: 1008,
                                        end: 1025,
                                        loc: {
                                          start: {
                                            line: 37,
                                            column: 35,
                                            index: 1008,
                                          },
                                          end: {
                                            line: 37,
                                            column: 52,
                                            index: 1025,
                                          },
                                        },
                                        expression: {
                                          type: 'MemberExpression',
                                          start: 1009,
                                          end: 1024,
                                          loc: {
                                            start: {
                                              line: 37,
                                              column: 36,
                                              index: 1009,
                                            },
                                            end: {
                                              line: 37,
                                              column: 51,
                                              index: 1024,
                                            },
                                          },
                                          object: {
                                            type: 'Identifier',
                                            start: 1009,
                                            end: 1016,
                                            loc: {
                                              start: {
                                                line: 37,
                                                column: 36,
                                                index: 1009,
                                              },
                                              end: {
                                                line: 37,
                                                column: 43,
                                                index: 1016,
                                              },
                                              identifierName: 'library',
                                            },
                                            name: 'library',
                                          },
                                          computed: false,
                                          property: {
                                            type: 'Identifier',
                                            start: 1017,
                                            end: 1024,
                                            loc: {
                                              start: {
                                                line: 37,
                                                column: 44,
                                                index: 1017,
                                              },
                                              end: {
                                                line: 37,
                                                column: 51,
                                                index: 1024,
                                              },
                                              identifierName: 'scarfId',
                                            },
                                            name: 'scarfId',
                                          },
                                        },
                                      },
                                    },
                                  ],
                                  selfClosing: true,
                                },
                                closingElement: null,
                                children: [],
                              },
                              alternate: {
                                type: 'NullLiteral',
                                start: 1031,
                                end: 1035,
                                loc: {
                                  start: {
                                    line: 37,
                                    column: 58,
                                    index: 1031,
                                  },
                                  end: {
                                    line: 37,
                                    column: 62,
                                    index: 1035,
                                  },
                                },
                              },
                            },
                          },
                          {
                            type: 'JSXText',
                            start: 1036,
                            end: 1041,
                            loc: {
                              start: {
                                line: 37,
                                column: 63,
                                index: 1036,
                              },
                              end: {
                                line: 38,
                                column: 4,
                                index: 1041,
                              },
                            },
                            extra: {
                              rawValue: '\n    ',
                              raw: '\n    ',
                            },
                            value: '\n    ',
                          },
                        ],
                        extra: {
                          parenthesized: true,
                          parenStart: 947,
                        },
                      },
                    },
                  ],
                  directives: [],
                },
                generator: false,
                async: false,
              },
            },
          ],
        },
        {
          type: 'ExportNamedDeclaration',
          declaration: null,
          specifiers: [
            {
              type: 'ExportSpecifier',
              local: {
                type: 'Identifier',
                name: 'component',
              },
              exported: {
                type: 'Identifier',
                name: 'component',
              },
            },
          ],
          source: null,
        },
      ],
      directives: [],
      extra: {
        topLevelAwait: false,
      },
    },
    comments: [],
  }
}
