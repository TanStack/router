import { describe, expect, it } from 'vitest'
import {
  TemplateError,
  astTemplatesPlugin,
  compileAstTemplates,
} from '../ast-templates-plugin'
import { formatSnapshot } from './format-snapshot'

const header = `import { astTemplate, hole, importMeta } from '../ast-template'\n`

async function compile(source: string) {
  const output = compileAstTemplates(header + source, '/src/core/template.ts')
  return output && (await formatSnapshot(output.code, 'template.ts'))
}

function compileError(source: string) {
  try {
    compileAstTemplates(header + source, '/src/core/template.ts')
  } catch (error) {
    if (error instanceof TemplateError) {
      return `${error.message}\n${error.frame}`
    }
    throw error
  }
  throw new Error('The template compiled')
}

describe('compileAstTemplates', () => {
  it('builds statements with b.* calls', async () => {
    expect(
      await compile(`
declare const Route: { id: string }
const template = astTemplate(
  {
    routeId: hole.literal<string | undefined>(),
    onUpdate: hole.expression<(id: string) => void>(),
    lazy: hole.identifier<() => unknown>(),
  },
  ({ routeId, onUpdate, lazy }) => {
    const hot = importMeta.hot
    if (hot) {
      const id = routeId ?? Route.id
      onUpdate(id)
      lazy()
    }
  },
)
`),
    ).toMatchInlineSnapshot(`
      "import { b } from 'yuku-ast'
      import { literal, reference } from '../ast-template'
      declare const Route: { id: string }
      const template = (holes) => [
        b.VariableDeclaration({
          kind: 'const',
          declarations: [
            b.VariableDeclarator({
              id: b.Identifier({ name: 'hot' }),
              init: b.MemberExpression({
                object: b.MetaProperty({
                  meta: b.Identifier({ name: 'import' }),
                  property: b.Identifier({ name: 'meta' }),
                }),
                property: b.Identifier({ name: 'hot' }),
                computed: false,
                optional: false,
              }),
            }),
          ],
        }),
        b.IfStatement({
          test: b.Identifier({ name: 'hot' }),
          consequent: b.BlockStatement({
            body: [
              b.VariableDeclaration({
                kind: 'const',
                declarations: [
                  b.VariableDeclarator({
                    id: b.Identifier({ name: 'id' }),
                    init: b.LogicalExpression({
                      left: literal(holes.routeId),
                      right: b.MemberExpression({
                        object: reference('Route'),
                        property: b.Identifier({ name: 'id' }),
                        computed: false,
                        optional: false,
                      }),
                      operator: '??',
                    }),
                  }),
                ],
              }),
              b.ExpressionStatement({
                expression: b.CallExpression({
                  callee: holes.onUpdate,
                  arguments: [b.Identifier({ name: 'id' })],
                  optional: false,
                }),
              }),
              b.ExpressionStatement({
                expression: b.CallExpression({
                  callee: reference(holes.lazy),
                  arguments: [],
                  optional: false,
                }),
              }),
            ],
          }),
          alternate: null,
        }),
      ]
      "
    `)
  })

  it('builds an expression', async () => {
    expect(
      await compile(`
declare const Route: { id: string }
const template = astTemplate({}, () => Route.id)
`),
    ).toMatchInlineSnapshot(`
      "import { b } from 'yuku-ast'
      import { reference } from '../ast-template'
      declare const Route: { id: string }
      const template = () =>
        b.MemberExpression({
          object: reference('Route'),
          property: b.Identifier({ name: 'id' }),
          computed: false,
          optional: false,
        })
      "
    `)
  })

  it('declares, exports and splices holes', async () => {
    expect(
      await compile(`
const template = astTemplate(
  {
    Component: hole.binding({ exported: true }),
    value: hole.expression<number>(),
    more: hole.statements(),
  },
  ({ value, more }) => {
    function Component() {
      return value + value
    }
    more()
  },
)
`),
    ).toMatchInlineSnapshot(`
      "import { b } from 'yuku-ast'
      import { copy } from '../ast-template'
      const template = (holes) => [
        b.ExportNamedDeclaration({
          declaration: b.FunctionDeclaration({
            id: b.Identifier({ name: holes.Component }),
            generator: false,
            async: false,
            params: [],
            body: b.BlockStatement({
              body: [
                b.ReturnStatement({
                  argument: b.BinaryExpression({
                    left: holes.value,
                    right: copy(holes.value),
                    operator: '+',
                  }),
                }),
              ],
            }),
            expression: false,
          }),
          specifiers: [],
          source: null,
          attributes: [],
          exportKind: 'value',
        }),
        ...holes.more,
      ]
      "
    `)
  })

  it('strips types, comments and parentheses', async () => {
    expect(
      await compile(`
declare const window: { router?: { id: string } }
const template = astTemplate({}, () => {
  type Router = { id: string }
  // The router of the page
  const router = window.router as Router
  const id: string = (router!).id
  // prettier-ignore
  ;((router)).id
  try {
    void id
  } catch (_err) {
    /* noop */
  }
})
`),
    ).toMatchInlineSnapshot(`
      "import { b } from 'yuku-ast'
      import { reference } from '../ast-template'
      declare const window: { router?: { id: string } }
      const template = () => [
        b.VariableDeclaration({
          kind: 'const',
          declarations: [
            b.VariableDeclarator({
              id: b.Identifier({ name: 'router' }),
              init: b.MemberExpression({
                object: reference('window'),
                property: b.Identifier({ name: 'router' }),
                computed: false,
                optional: false,
              }),
            }),
          ],
        }),
        b.VariableDeclaration({
          kind: 'const',
          declarations: [
            b.VariableDeclarator({
              id: b.Identifier({ name: 'id' }),
              init: b.MemberExpression({
                object: b.Identifier({ name: 'router' }),
                property: b.Identifier({ name: 'id' }),
                computed: false,
                optional: false,
              }),
            }),
          ],
        }),
        b.ExpressionStatement({
          expression: b.MemberExpression({
            object: b.Identifier({ name: 'router' }),
            property: b.Identifier({ name: 'id' }),
            computed: false,
            optional: false,
          }),
        }),
        b.TryStatement({
          block: b.BlockStatement({
            body: [
              b.ExpressionStatement({
                expression: b.UnaryExpression({
                  operator: 'void',
                  prefix: true,
                  argument: b.Identifier({ name: 'id' }),
                }),
              }),
            ],
          }),
          handler: b.CatchClause({
            param: b.Identifier({ name: '_err' }),
            body: b.BlockStatement({ body: [] }),
          }),
          finalizer: null,
        }),
      ]
      "
    `)
  })

  it('leaves modules without templates alone', () => {
    expect(
      compileAstTemplates(`export const a = 1\n`, '/src/core/a.ts'),
    ).toBeNull()
  })
})

describe('template errors', () => {
  it('rejects an unknown hole', () => {
    expect(
      compileError(`
const template = astTemplate({}, ({ routeId }) => routeId)
`),
    ).toMatchInlineSnapshot(`
      "/src/core/template.ts:3:37: unknown hole \`routeId\`: declare it in the first argument
        1 | import { astTemplate, hole, importMeta } from '../ast-template'
        2 |
      > 3 | const template = astTemplate({}, ({ routeId }) => routeId)
          |                                     ^^^^^^^
        4 |"
    `)
  })

  it('rejects an unused hole', () => {
    expect(
      compileError(`
const template = astTemplate(
  { routeId: hole.literal<string>(), unused: hole.expression<number>() },
  ({ routeId }) => routeId,
)
`),
    ).toMatchInlineSnapshot(`
      "/src/core/template.ts:4:38: unused hole \`unused\`
        2 |
        3 | const template = astTemplate(
      > 4 |   { routeId: hole.literal<string>(), unused: hole.expression<number>() },
          |                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        5 |   ({ routeId }) => routeId,
        6 | )"
    `)
  })

  it('rejects syntax without a JavaScript form', () => {
    expect(
      compileError(`
const template = astTemplate({}, () => {
  enum Kind { A }
})
`),
    ).toMatchInlineSnapshot(`
      "/src/core/template.ts:4:3: \`TSEnumDeclaration\` has no place in the JavaScript a template builds
        2 |
        3 | const template = astTemplate({}, () => {
      > 4 |   enum Kind { A }
          |   ^^^^^^^^^^^^^^^
        5 | })
        6 |"
    `)
  })

  it('rejects a binding of the template module', () => {
    expect(
      compileError(`
const prefix = 'tsr'
const template = astTemplate({}, () => prefix)
`),
    ).toMatchInlineSnapshot(`
      "/src/core/template.ts:4:40: \`prefix\` is a binding of the template module, but templates run in route modules: use a hole, or \`declare\` the route module's binding
        2 |
        3 | const prefix = 'tsr'
      > 4 | const template = astTemplate({}, () => prefix)
          |                                        ^^^^^^
        5 |"
    `)
  })

  it('rejects statements used as a value', () => {
    expect(
      compileError(`
const template = astTemplate({ more: hole.statements() }, ({ more }) => {
  const value = more
})
`),
    ).toMatchInlineSnapshot(`
      "/src/core/template.ts:4:17: \`more\` holds statements: call it as a statement, \`more()\`
        2 |
        3 | const template = astTemplate({ more: hole.statements() }, ({ more }) => {
      > 4 |   const value = more
          |                 ^^^^
        5 | })
        6 |"
    `)
  })

  it('reports errors with their frame through the bundler', () => {
    const plugin = astTemplatesPlugin()
    const transform = plugin.transform as {
      handler: (this: unknown, code: string, id: string) => unknown
    }
    const context = {
      error(error: { message: string; frame: string }): never {
        throw Object.assign(new Error(error.message), { frame: error.frame })
      },
    }
    expect(() =>
      transform.handler.call(
        context,
        `${header}const template = astTemplate({}, ({ id }) => id)\n`,
        '/src/core/template.ts',
      ),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('/src/core/template.ts:2:'),
        frame: expect.stringContaining('> 2 |'),
      }),
    )
  })
})
