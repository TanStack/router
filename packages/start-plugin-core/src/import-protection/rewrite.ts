import {
  analyzeModule,
  cloneModuleAst,
  generateModule,
  parseStatements,
} from '@tanstack/router-utils'
import { is, isValidIdentifier, nameOf } from 'yuku-ast'
import { MOCK_MODULE_ID } from './constants'
import type { SourceMapLike } from './sourceLocation'

function memberAccess(object: string, name: string): string {
  return isValidIdentifier(name)
    ? `${object}.${name}`
    : `${object}[${JSON.stringify(name)}]`
}

function exportName(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name)
}

/** Rewrite denied static edges using one source analysis and an isolated output AST. */
export function rewriteDeniedImports(
  code: string,
  id: string,
  deniedSources: Set<string>,
  getMockModuleId: (source: string) => string = () => MOCK_MODULE_ID,
): { code: string; map?: SourceMapLike } | undefined {
  const module = analyzeModule({ code, filename: id })
  const { program } = cloneModuleAst(module)
  const usedNames = new Set(module.symbols.map((symbol) => symbol.name))
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
    const statements = [
      `import ${mockVar} from ${JSON.stringify(getMockModuleId(node.source.value))}`,
    ]
    if (is.ImportDeclaration(node)) {
      for (const specifier of node.specifiers) {
        if (is.ImportSpecifier(specifier)) {
          if (specifier.importKind === 'type') {
            continue
          }
          const imported = nameOf(specifier.imported)
          statements.push(
            `const ${specifier.local.name} = ${memberAccess(mockVar, imported)}`,
          )
        } else {
          statements.push(`const ${specifier.local.name} = ${mockVar}`)
        }
      }
    } else {
      const exportSpecifiers: Array<string> = []
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
        statements.push(`const ${internal} = ${memberAccess(mockVar, local)}`)
        exportSpecifiers.push(`${internal} as ${exportName(exported)}`)
      }
      if (exportSpecifiers.length) {
        statements.push(`export { ${exportSpecifiers.join(', ')} }`)
      }
    }
    const replacements = parseStatements(statements.join('\n'))
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
