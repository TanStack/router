import { analyzeModule, generateModule } from '@tanstack/router-utils'
import { b, is, isValidIdentifier, nameOf } from 'yuku-ast'
import { MOCK_MODULE_ID } from './constants'
import type { SourceMapLike } from './sourceLocation'
import type {
  ExportSpecifier,
  Expression,
  ProgramStatement,
  StringLiteral,
} from '@yuku-toolchain/types'

function stringLiteral(value: string) {
  return b.Literal({ value, raw: JSON.stringify(value) }) as StringLiteral
}

/** `name` as an identifier, or quoted when it is not a valid one. */
function moduleExportName(name: string) {
  return isValidIdentifier(name) ? b.Identifier({ name }) : stringLiteral(name)
}

/** `object.name`, or `object["name"]` when `name` is not a valid identifier. */
function memberAccess(object: string, name: string) {
  return isValidIdentifier(name)
    ? b.MemberExpression({
        object: b.Identifier({ name: object }),
        property: b.Identifier({ name }),
        computed: false,
        optional: false,
      })
    : b.MemberExpression({
        object: b.Identifier({ name: object }),
        property: stringLiteral(name),
        computed: true,
        optional: false,
      })
}

/** `const name = init` */
function constDeclaration(name: string, init: Expression) {
  return b.VariableDeclaration({
    kind: 'const',
    declarations: [b.VariableDeclarator({ id: b.Identifier({ name }), init })],
  })
}

/** Rewrite denied static edges in the analyzed tree, which serves this one output. */
export function rewriteDeniedImports(
  code: string,
  id: string,
  deniedSources: Set<string>,
  getMockModuleId: (source: string) => string = () => MOCK_MODULE_ID,
): { code: string; map?: SourceMapLike } | undefined {
  const module = analyzeModule({ code, filename: id })
  const program = module.ast
  const usedNames = new Set(module.bindings.map((binding) => binding.name))
  let counter = 0
  const uniqueName = (prefix: string) => {
    let name = prefix
    while (usedNames.has(name)) {
      name = `${prefix}_${counter++}`
    }
    usedNames.add(name)
    return name
  }
  let modified = false
  for (let i = program.body.length - 1; i >= 0; i--) {
    const node = program.body[i]!
    if (
      !(
        is.ImportDeclaration(node) ||
        is.ExportNamedDeclaration(node) ||
        is.ExportAllDeclaration(node)
      )
    ) {
      continue
    }
    if (!node.source || !deniedSources.has(node.source.value)) {
      continue
    }
    if (
      (is.ImportDeclaration(node) && node.importKind === 'type') ||
      (!is.ImportDeclaration(node) && node.exportKind === 'type')
    ) {
      continue
    }
    if (is.ExportAllDeclaration(node)) {
      program.body.splice(i, 1)
      modified = true
      continue
    }
    const mockIndex = counter++
    const mockVar = uniqueName(`__tss_deny_${mockIndex}`)
    // import <mockVar> from "<mock module id>"
    const replacements: Array<ProgramStatement> = [
      b.ImportDeclaration({
        specifiers: [
          b.ImportDefaultSpecifier({ local: b.Identifier({ name: mockVar }) }),
        ],
        source: stringLiteral(getMockModuleId(node.source.value)),
        phase: null,
        attributes: [],
        importKind: 'value',
      }),
    ]
    if (is.ImportDeclaration(node)) {
      for (const specifier of node.specifiers) {
        if (is.ImportSpecifier(specifier)) {
          if (specifier.importKind === 'type') {
            continue
          }
          const imported = nameOf(specifier.imported)
          replacements.push(
            constDeclaration(
              specifier.local.name,
              memberAccess(mockVar, imported),
            ),
          )
        } else {
          replacements.push(
            constDeclaration(
              specifier.local.name,
              b.Identifier({ name: mockVar }),
            ),
          )
        }
      }
    } else {
      const exportSpecifiers: Array<ExportSpecifier> = []
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === 'type') {
          continue
        }
        const local = nameOf(specifier.local)
        const exported = nameOf(specifier.exported)
        const internal = uniqueName(
          isValidIdentifier(local)
            ? `__tss_reexport_${local}`
            : `__tss_reexport_${mockIndex}`,
        )
        replacements.push(
          constDeclaration(internal, memberAccess(mockVar, local)),
        )
        // <internal> as <exported>
        exportSpecifiers.push(
          b.ExportSpecifier({
            local: b.Identifier({ name: internal }),
            exported: moduleExportName(exported),
            exportKind: 'value',
          }),
        )
      }
      if (exportSpecifiers.length) {
        replacements.push(
          b.ExportNamedDeclaration({
            declaration: null,
            specifiers: exportSpecifiers,
            source: null,
            attributes: [],
            exportKind: 'value',
          }),
        )
      }
    }
    for (const statement of replacements) {
      statement.start = node.start
      statement.end = node.end
    }
    program.body.splice(i, 1, ...replacements)
    modified = true
  }
  if (!modified) {
    return undefined
  }
  const result = generateModule(program, { source: code, filename: id })
  return {
    code: result.code,
    ...(result.map ? { map: result.map as SourceMapLike } : {}),
  }
}
