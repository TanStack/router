import * as t from '@babel/types'
import { generateFromAst } from '@tanstack/router-utils'

import { MOCK_MODULE_ID } from './virtualModules'
import { getOrCreate } from './utils'
import { parseImportProtectionAst } from './ast'
import type { SourceMapLike } from './sourceLocation'
import type { ParsedAst } from './ast'

export function isValidExportName(name: string): boolean {
  if (name === 'default' || name.length === 0) return false
  const first = name.charCodeAt(0)
  // First char: A-Z (65-90), a-z (97-122), _ (95), $ (36)
  if (
    !(
      (first >= 65 && first <= 90) ||
      (first >= 97 && first <= 122) ||
      first === 95 ||
      first === 36
    )
  )
    return false
  for (let i = 1; i < name.length; i++) {
    const ch = name.charCodeAt(i)
    // Subsequent: A-Z, a-z, 0-9 (48-57), _, $
    if (
      !(
        (ch >= 65 && ch <= 90) ||
        (ch >= 97 && ch <= 122) ||
        (ch >= 48 && ch <= 57) ||
        ch === 95 ||
        ch === 36
      )
    )
      return false
  }
  return true
}

export function collectMockExportNamesBySource(
  code: string,
): Map<string, Array<string>> {
  return collectMockExportNamesBySourceFromAst(parseImportProtectionAst(code))
}

function collectMockExportNamesBySourceFromAst(
  ast: ParsedAst,
): Map<string, Array<string>> {
  const namesBySource = new Map<string, Set<string>>()
  const memberBindingToSource = new Map<string, string>()
  const add = (source: string, name: string) => {
    if (name === 'default' || name.length === 0) return
    getOrCreate(namesBySource, source, () => new Set<string>()).add(name)
  }

  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) {
      if (node.importKind === 'type') continue
      const source = node.source.value
      for (const s of node.specifiers) {
        if (t.isImportNamespaceSpecifier(s)) {
          memberBindingToSource.set(s.local.name, source)
          continue
        }
        if (t.isImportDefaultSpecifier(s)) {
          memberBindingToSource.set(s.local.name, source)
          continue
        }
        if (!t.isImportSpecifier(s)) continue
        if (s.importKind === 'type') continue
        const importedName = t.isIdentifier(s.imported)
          ? s.imported.name
          : s.imported.value
        // `import { default as x } from 'm'` only requires a default export.
        if (importedName === 'default') continue
        add(source, importedName)
      }
    }

    if (t.isExportNamedDeclaration(node) && node.source?.value) {
      if (node.exportKind === 'type') continue
      const source = node.source.value
      for (const s of node.specifiers) {
        if (!t.isExportSpecifier(s)) continue
        if (s.exportKind === 'type') continue
        add(source, s.local.name)
      }
    }
  }

  // For namespace/default imports, collect property names used as
  // `binding.foo`/`binding?.foo` so mock-edge modules can expose explicit ESM
  // named exports required by Rolldown/native ESM.
  if (memberBindingToSource.size > 0) {
    const visit = (node: t.Node): void => {
      if (t.isMemberExpression(node)) {
        const object = node.object
        if (t.isIdentifier(object)) {
          const source = memberBindingToSource.get(object.name)
          if (source) {
            const property = node.property
            if (!node.computed && t.isIdentifier(property)) {
              add(source, property.name)
            } else if (node.computed && t.isStringLiteral(property)) {
              add(source, property.value)
            }
          }
        }
      }

      const keys = t.VISITOR_KEYS[node.type]
      if (!keys) return
      for (const key of keys) {
        const child = (node as unknown as Record<string, unknown>)[key]
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              visit(item as t.Node)
            }
          }
        } else if (child && typeof child === 'object' && 'type' in child) {
          visit(child as t.Node)
        }
      }
    }

    visit(ast.program)
  }

  const out = new Map<string, Array<string>>()
  for (const [source, set] of namesBySource) {
    out.set(source, Array.from(set).sort())
  }
  return out
}

/** Collect all valid named export identifiers from the given code. */
export function collectNamedExports(code: string): Array<string> {
  return collectNamedExportsFromAst(parseImportProtectionAst(code))
}

function collectIdentifiersFromPattern(
  pattern: t.LVal,
  add: (name: string) => void,
): void {
  if (t.isIdentifier(pattern)) {
    add(pattern.name)
  } else if (t.isObjectPattern(pattern)) {
    for (const prop of pattern.properties) {
      if (t.isRestElement(prop)) {
        collectIdentifiersFromPattern(prop.argument as t.LVal, add)
      } else {
        collectIdentifiersFromPattern(prop.value as t.LVal, add)
      }
    }
  } else if (t.isArrayPattern(pattern)) {
    for (const elem of pattern.elements) {
      if (elem) collectIdentifiersFromPattern(elem as t.LVal, add)
    }
  } else if (t.isAssignmentPattern(pattern)) {
    collectIdentifiersFromPattern(pattern.left, add)
  } else if (t.isRestElement(pattern)) {
    collectIdentifiersFromPattern(pattern.argument as t.LVal, add)
  }
}

function collectNamedExportsFromAst(ast: ParsedAst): Array<string> {
  const names = new Set<string>()
  const add = (name: string) => {
    if (isValidExportName(name)) names.add(name)
  }

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      if (node.exportKind === 'type') continue

      if (node.declaration) {
        const decl = node.declaration
        if (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) {
          if (decl.id?.name) add(decl.id.name)
        } else if (t.isVariableDeclaration(decl)) {
          for (const d of decl.declarations) {
            collectIdentifiersFromPattern(d.id as t.LVal, add)
          }
        }
      }

      for (const s of node.specifiers) {
        if (!t.isExportSpecifier(s)) continue
        if (s.exportKind === 'type') continue
        const exportedName = t.isIdentifier(s.exported)
          ? s.exported.name
          : s.exported.value
        add(exportedName)
      }
    }
  }

  return Array.from(names).sort()
}

/**
 * Rewrite static imports/re-exports from denied sources using Babel AST transforms.
 *
 * Transforms:
 *   import { a as b, c } from 'denied'
 * Into:
 *   import __tss_deny_0 from 'tanstack-start-import-protection:mock'
 *   const b = __tss_deny_0.a
 *   const c = __tss_deny_0.c
 *
 * Also handles:
 *   import def from 'denied'        -> import def from mock
 *   import * as ns from 'denied'    -> import ns from mock
 *   export { x } from 'denied'      -> export const x = mock.x
 *   export * from 'denied'          -> removed
 *   export { x as y } from 'denied' -> export const y = mock.x
 */
export function rewriteDeniedImports(
  code: string,
  id: string,
  deniedSources: Set<string>,
  getMockModuleId: (source: string) => string = () => MOCK_MODULE_ID,
): { code: string; map?: SourceMapLike } | undefined {
  return rewriteDeniedImportsFromAst(
    parseImportProtectionAst(code),
    id,
    deniedSources,
    getMockModuleId,
  )
}

function rewriteDeniedImportsFromAst(
  ast: ParsedAst,
  id: string,
  deniedSources: Set<string>,
  getMockModuleId: (source: string) => string = () => MOCK_MODULE_ID,
): { code: string; map?: SourceMapLike } | undefined {
  let modified = false
  let mockCounter = 0

  // Walk program body in reverse so splice indices stay valid
  for (let i = ast.program.body.length - 1; i >= 0; i--) {
    const node = ast.program.body[i]!

    if (t.isImportDeclaration(node)) {
      if (node.importKind === 'type') continue
      if (!deniedSources.has(node.source.value)) continue

      const mockVar = `__tss_deny_${mockCounter++}`
      const replacements: Array<t.Statement> = []

      replacements.push(
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(mockVar))],
          t.stringLiteral(getMockModuleId(node.source.value)),
        ),
      )

      for (const specifier of node.specifiers) {
        if (
          t.isImportDefaultSpecifier(specifier) ||
          t.isImportNamespaceSpecifier(specifier)
        ) {
          replacements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(specifier.local.name),
                t.identifier(mockVar),
              ),
            ]),
          )
        } else if (t.isImportSpecifier(specifier)) {
          if (specifier.importKind === 'type') continue
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          replacements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(specifier.local.name),
                t.memberExpression(
                  t.identifier(mockVar),
                  t.identifier(importedName),
                ),
              ),
            ]),
          )
        }
      }

      ast.program.body.splice(i, 1, ...replacements)
      modified = true
      continue
    }

    if (t.isExportNamedDeclaration(node) && node.source) {
      if (node.exportKind === 'type') continue
      if (!deniedSources.has(node.source.value)) continue

      const mockVar = `__tss_deny_${mockCounter++}`
      const replacements: Array<t.Statement> = []

      replacements.push(
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(mockVar))],
          t.stringLiteral(getMockModuleId(node.source.value)),
        ),
      )
      const exportSpecifiers: Array<{
        localName: string
        exportedName: string
      }> = []
      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier)) {
          if (specifier.exportKind === 'type') continue
          const localName = specifier.local.name
          const exportedName = t.isIdentifier(specifier.exported)
            ? specifier.exported.name
            : specifier.exported.value

          const internalVar = `__tss_reexport_${localName}`
          replacements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(internalVar),
                t.memberExpression(
                  t.identifier(mockVar),
                  t.identifier(localName),
                ),
              ),
            ]),
          )
          exportSpecifiers.push({ localName: internalVar, exportedName })
        }
      }

      if (exportSpecifiers.length > 0) {
        replacements.push(
          t.exportNamedDeclaration(
            null,
            exportSpecifiers.map((s) =>
              t.exportSpecifier(
                t.identifier(s.localName),
                t.identifier(s.exportedName),
              ),
            ),
          ),
        )
      }

      ast.program.body.splice(i, 1, ...replacements)
      modified = true
      continue
    }

    if (t.isExportAllDeclaration(node)) {
      if (node.exportKind === 'type') continue
      if (!deniedSources.has(node.source.value)) continue

      ast.program.body.splice(i, 1)
      modified = true
      continue
    }
  }

  if (!modified) return undefined

  const result = generateFromAst(ast, {
    sourceMaps: true,
    sourceFileName: id,
    filename: id,
  })

  return {
    code: result.code,
    ...(result.map ? { map: result.map as SourceMapLike } : {}),
  }
}
