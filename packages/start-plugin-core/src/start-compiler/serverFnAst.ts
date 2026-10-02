import { b } from 'yuku-ast'
import { linkGeneratedReference } from '@tanstack/router-utils'
import type { ObjectProperty, StringLiteral } from '@yuku-toolchain/types'

export function createServerFnCaller(runtimeName: string, functionId: string) {
  return b.CallExpression({
    callee: generatedReference(runtimeName),
    arguments: [stringLiteral(functionId)],
    optional: false,
  })
}

export function createServerFnProvider({
  runtimeName,
  functionName,
  functionId,
  variableName,
  relativeFilename,
}: {
  runtimeName: string
  functionName: string
  functionId: string
  variableName: string
  relativeFilename: string
}) {
  return b.VariableDeclaration({
    kind: 'const',
    declarations: [
      b.VariableDeclarator({
        id: b.Identifier({ name: functionName }),
        init: b.CallExpression({
          callee: generatedReference(runtimeName),
          arguments: [
            b.ObjectExpression({
              properties: Object.entries({
                id: functionId,
                name: variableName,
                filename: relativeFilename,
              }).map(
                ([key, value]): ObjectProperty => ({
                  type: 'Property',
                  start: 0,
                  end: 0,
                  kind: 'init',
                  key: stringLiteral(key),
                  value: stringLiteral(value),
                  method: false,
                  shorthand: false,
                  computed: false,
                }),
              ),
            }),
            b.ArrowFunctionExpression({
              id: null,
              generator: false,
              async: false,
              expression: true,
              params: [b.Identifier({ name: 'opts' })],
              body: b.CallExpression({
                callee: b.MemberExpression({
                  object: generatedReference(variableName),
                  property: b.Identifier({ name: '__executeServer' }),
                  computed: false,
                  optional: false,
                }),
                // opts belongs to this generated callback, not a source binding.
                arguments: [b.Identifier({ name: 'opts' })],
                optional: false,
              }),
            }),
          ],
          optional: false,
        }),
      }),
    ],
  })
}

export function createServerFnExports(exportNames: Iterable<string>) {
  return b.ExportNamedDeclaration({
    declaration: null,
    source: null,
    attributes: [],
    exportKind: 'value',
    specifiers: [...exportNames].map((name) =>
      b.ExportSpecifier({
        local: b.Identifier({ name }),
        exported: b.Identifier({ name }),
        exportKind: 'value',
      }),
    ),
  })
}

export function createServerFnHmr() {
  return ['hot', 'webpackHot'].map((name) => {
    const hot = () =>
      b.MemberExpression({
        object: b.MetaProperty({
          meta: b.Identifier({ name: 'import' }),
          property: b.Identifier({ name: 'meta' }),
        }),
        property: b.Identifier({ name }),
        computed: false,
        optional: false,
      })
    return b.IfStatement({
      test: hot(),
      consequent: b.BlockStatement({
        body: [
          b.ExpressionStatement({
            expression: b.CallExpression({
              callee: b.MemberExpression({
                object: hot(),
                property: b.Identifier({ name: 'accept' }),
                computed: false,
                optional: false,
              }),
              arguments: [
                b.ArrowFunctionExpression({
                  id: null,
                  generator: false,
                  async: false,
                  expression: false,
                  params: [],
                  body: b.BlockStatement({ body: [] }),
                }),
              ],
              optional: false,
            }),
          }),
        ],
      }),
      alternate: null,
    })
  })
}

export function createServerFnImport(
  runtimeName: string,
  framework: string,
  importPath: string,
) {
  return b.ImportDeclaration({
    specifiers: [
      b.ImportSpecifier({
        imported: b.Identifier({ name: runtimeName }),
        local: b.Identifier({ name: runtimeName }),
        importKind: 'value',
      }),
    ],
    source: {
      ...stringLiteral(`@tanstack/${framework}-start/${importPath}`),
      raw: `'@tanstack/${framework}-start/${importPath}'`,
    },
    phase: null,
    attributes: [],
    importKind: 'value',
  })
}

// Builders default to zero spans, matching compiler-owned parsed fragments.
// Only references outside the generated fragment participate in source cleanup.
export function generatedReference(name: string) {
  return linkGeneratedReference(b.Identifier({ name }), name)
}

export function stringLiteral(value: string): StringLiteral {
  return {
    type: 'Literal',
    start: 0,
    end: 0,
    value,
    raw: JSON.stringify(value),
  }
}
