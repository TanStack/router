import * as t from '@babel/types'
import { generateFromAst, parseAst } from '@tanstack/router-utils'

import { MOCK_MODULE_ID } from './virtualModules'
import { getOrCreate } from './utils'

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

/**
 * Best-effort static analysis of an importer's source to determine which
 * named exports are needed per specifier, to keep native ESM valid in dev.
 */
export function collectMockExportNamesBySource(
  code: string,
): Map<string, Array<string>> {
  const ast = parseAst({ code })

  const namesBySource = new Map<string, Set<string>>()
  const add = (source: string, name: string) => {
    if (name === 'default' || name.length === 0) return
    getOrCreate(namesBySource, source, () => new Set<string>()).add(name)
  }

  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) {
      if (node.importKind === 'type') continue
      const source = node.source.value
      for (const s of node.specifiers) {
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

  const out = new Map<string, Array<string>>()
  for (const [source, set] of namesBySource) {
    out.set(source, Array.from(set).sort())
  }
  return out
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
): { code: string; map?: object | null } | undefined {
  const ast = parseAst({ code })
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

  return { code: result.code, map: result.map }
}
