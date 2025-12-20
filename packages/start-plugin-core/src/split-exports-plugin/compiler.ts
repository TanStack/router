import * as t from '@babel/types'
import babel from '@babel/core'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import { appendSplitExportsQuery, hasSplitExportsQuery } from './query-utils'
import type { GeneratorResult, ParseAstResult } from '@tanstack/router-utils'

/**
 * Result of extracting imports from a module.
 * Includes the parsed AST for reuse in subsequent transformations.
 */
export interface ExtractImportsResult {
  /** Map of source module -> set of imported names */
  imports: Map<string, Set<string>>
  /** The parsed AST, can be reused by transformImports to avoid double parsing */
  ast: ParseAstResult
}

/**
 * Check if an import source looks like a bare module specifier (npm package).
 * Examples: 'lodash', '@tanstack/react-router', 'react-dom/client'
 */
export function isBareModuleSpecifier(source: string): boolean {
  // Relative or absolute imports
  if (source.startsWith('.') || source.startsWith('/')) {
    return false
  }

  // Common alias prefixes
  if (source.startsWith('~') || source.startsWith('#')) {
    return false
  }

  // Scoped packages (@scope/package) vs aliases (@/path)
  if (source.startsWith('@')) {
    const match = source.match(/^@([^/]+)\//)
    if (!match) return false // Just @ with no slash - probably an alias

    const scope = match[1]
    // Valid npm scope: non-empty, lowercase letters, numbers, hyphens
    return !!scope && /^[a-z0-9-]+$/.test(scope)
  }

  // Everything else is likely a bare module (lodash, react, etc.)
  return true
}

/**
 * Check if a module exports any classes.
 * This is used to skip the split-exports optimization for modules with class exports,
 * as class identity would be lost when the module is loaded with different query strings.
 *
 * Detects:
 * - export class Foo {}
 * - export default class Foo {}
 * - export default class {}
 * - class Foo {}; export { Foo }
 * - class Foo {}; export { Foo as Bar }
 * - export const Foo = class {}
 * - export const Bar = class BarClass {}
 * - const Foo = class {}; export { Foo }
 */
export function hasClassExports(code: string): boolean {
  // Quick string check for early bailout
  if (!code.includes('class ')) {
    return false
  }

  const ast = parseAst({ code })

  // Collect names of top-level class declarations and class expression variables
  const localClassNames = new Set<string>()

  for (const node of ast.program.body) {
    // Track local class declarations: class Foo {}
    if (t.isClassDeclaration(node) && node.id) {
      localClassNames.add(node.id.name)
    }

    // Track local class expressions: const Foo = class {}
    if (t.isVariableDeclaration(node)) {
      for (const declarator of node.declarations) {
        if (
          t.isClassExpression(declarator.init) &&
          t.isIdentifier(declarator.id)
        ) {
          localClassNames.add(declarator.id.name)
        }
      }
    }

    // 1. export class Foo {}
    if (t.isExportNamedDeclaration(node)) {
      if (t.isClassDeclaration(node.declaration)) {
        return true
      }

      // 2. export const Foo = class {}
      if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (t.isClassExpression(declarator.init)) {
            return true
          }
        }
      }
    }

    // 3. export default class {} or export default class Foo {}
    if (t.isExportDefaultDeclaration(node)) {
      if (
        t.isClassDeclaration(node.declaration) ||
        t.isClassExpression(node.declaration)
      ) {
        return true
      }
    }
  }

  // 4. Check for export { Foo } where Foo is a local class
  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node) && !node.source) {
      // Only check local exports, not re-exports like export { Foo } from './other'
      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
          if (localClassNames.has(specifier.local.name)) {
            return true
          }
        }
      }
    }
  }

  return false
}

/**
 * Parse a module and extract all import specifiers from it.
 * Returns a map of source module -> set of imported names, plus the parsed AST.
 * Type-only imports and namespace imports are ignored.
 * Bare module specifiers (npm packages) are skipped.
 *
 * The returned AST can be passed to `transformImports` to avoid double parsing.
 */
export function extractImportsFromModule(code: string): ExtractImportsResult {
  const ast = parseAst({ code })
  const imports = new Map<string, Set<string>>()

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue
    }

    // Skip type-only imports entirely (import type { ... })
    if (node.importKind === 'type') {
      continue
    }

    const source = node.source.value

    // Skip bare module specifiers (npm packages)
    if (isBareModuleSpecifier(source)) {
      continue
    }

    // Skip imports that already have our query parameter
    if (hasSplitExportsQuery(source)) {
      continue
    }

    // Check for namespace imports first - if present, skip this source entirely
    const hasNamespaceImport = node.specifiers.some((spec) =>
      t.isImportNamespaceSpecifier(spec),
    )
    if (hasNamespaceImport) {
      continue
    }

    // Skip side-effect only imports (import './foo')
    if (node.specifiers.length === 0) {
      continue
    }

    let importedNames = imports.get(source)
    if (!importedNames) {
      importedNames = new Set()
      imports.set(source, importedNames)
    }

    for (const specifier of node.specifiers) {
      // Skip type-only specifiers
      if (t.isImportSpecifier(specifier) && specifier.importKind === 'type') {
        continue
      }

      if (t.isImportSpecifier(specifier)) {
        const importedName = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value
        importedNames.add(importedName)
      } else if (t.isImportDefaultSpecifier(specifier)) {
        importedNames.add('default')
      }
      // Note: namespace imports are already filtered out above
    }
  }

  // Remove entries with no value imports (all type-only specifiers)
  // We don't need to transform these - Vite will handle them
  for (const [source, names] of imports) {
    if (names.size === 0) {
      imports.delete(source)
    }
  }

  return { imports, ast }
}

/**
 * Options for transforming imports.
 */
export interface TransformImportsOptions {
  /**
   * If provided, only transform imports from these sources.
   * The keys should match the original import source strings.
   * If not provided, transforms all imports returned by extractImportsFromModule.
   */
  importsToTransform?: Map<string, Set<string>>

  /**
   * If provided, reuse this AST instead of parsing the code again.
   * This should be the AST returned from extractImportsFromModule.
   */
  ast?: ParseAstResult

  /**
   * Whether to generate source maps.
   * @default true
   */
  sourceMaps?: boolean
}

/**
 * Transform import declarations to add the split-exports query parameter.
 * Returns the transformed code or null if no changes were made.
 *
 * @param code - The source code to transform
 * @param filename - The filename for source maps
 * @param options - Optional configuration for which imports to transform
 */
export function transformImports(
  code: string,
  filename: string,
  options: TransformImportsOptions = {},
): GeneratorResult | null {
  // Use provided imports or extract them (for backwards compatibility)
  let ast: ParseAstResult
  let imports: Map<string, Set<string>>

  if (options.importsToTransform) {
    imports = options.importsToTransform
    // Use provided AST or parse the code
    ast = options.ast ?? parseAst({ code })
  } else {
    // Extract imports and get AST in one pass
    const result = extractImportsFromModule(code)
    imports = result.imports
    ast = result.ast
  }

  if (imports.size === 0) {
    return null
  }

  // Track if we actually modified anything
  let hasChanges = false

  // Simple loop over top-level statements - imports are always at the top level
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue
    }

    const source = node.source.value

    // Only transform if this source is in our imports map
    // (extractImportsFromModule already filtered out type-only, namespace, etc.)
    const importedNames = imports.get(source)
    if (!importedNames || importedNames.size === 0) {
      continue
    }

    // Create new source with query string
    node.source = t.stringLiteral(
      appendSplitExportsQuery(source, importedNames),
    )
    hasChanges = true
  }

  if (!hasChanges) {
    return null
  }

  return generateFromAst(ast, {
    sourceMaps: options.sourceMaps ?? true,
    sourceFileName: filename,
    filename,
  })
}

/**
 * Options for transforming exports.
 */
export interface TransformExportsOptions {
  /**
   * Whether to generate source maps.
   * @default true
   */
  sourceMaps?: boolean
}

/**
 * Result of extracting all export names from a module.
 */
export interface GetAllExportNamesResult {
  /** Set of all export names in the module */
  exportNames: Set<string>
  /** The parsed AST, can be reused by transformExports */
  ast: ParseAstResult
  /** True if the module has wildcard re-exports (export * from) */
  hasWildcardReExport: boolean
}

/**
 * Extract exported names from a declaration node.
 */
function getExportedNamesFromDeclaration(
  declaration: t.Declaration,
): Array<string> {
  if (t.isVariableDeclaration(declaration)) {
    return declaration.declarations
      .filter((decl): decl is t.VariableDeclarator & { id: t.Identifier } =>
        t.isIdentifier(decl.id),
      )
      .map((decl) => decl.id.name)
  }

  if (
    (t.isFunctionDeclaration(declaration) ||
      t.isClassDeclaration(declaration)) &&
    declaration.id
  ) {
    return [declaration.id.name]
  }

  return []
}

/**
 * Get the exported name from an export specifier.
 */
function getExportedName(specifier: t.ExportSpecifier): string {
  return t.isIdentifier(specifier.exported)
    ? specifier.exported.name
    : specifier.exported.value
}

/**
 * Add binding identifiers from a path to the refIdents set for dead code elimination.
 * This ensures that local declarations created from removed exports can be eliminated.
 */
function addBindingIdentifiersToRefIdents(
  path: babel.NodePath,
  refIdents: Set<babel.NodePath<t.Identifier>>,
): void {
  path.traverse({
    Identifier(identPath: babel.NodePath<t.Identifier>) {
      // Add function/class name identifiers
      if (
        (identPath.parentPath.isFunctionDeclaration() ||
          identPath.parentPath.isClassDeclaration()) &&
        identPath.key === 'id'
      ) {
        refIdents.add(identPath)
      }
      // Add variable declarator identifiers
      if (
        identPath.parentPath.isVariableDeclarator() &&
        identPath.key === 'id'
      ) {
        refIdents.add(identPath)
      }
    },
  })
}

/**
 * Quickly extract all export names from a module.
 * This is used for early bailout optimization when all exports are requested.
 * Returns the AST so it can be reused by transformExports if needed.
 */
export function getAllExportNames(code: string): GetAllExportNamesResult {
  const ast = parseAst({ code })
  const exportNames = new Set<string>()
  let hasWildcardReExport = false

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      // Handle: export const foo = ..., export function bar() {}, etc.
      if (node.declaration) {
        for (const name of getExportedNamesFromDeclaration(node.declaration)) {
          exportNames.add(name)
        }
      }

      // Handle: export { foo, bar as baz } and export { foo } from './other'
      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier)) {
          exportNames.add(getExportedName(specifier))
        }
      }
    } else if (t.isExportDefaultDeclaration(node)) {
      exportNames.add('default')
    } else if (t.isExportAllDeclaration(node)) {
      // We can't enumerate exports from wildcard re-exports
      hasWildcardReExport = true
    }
  }

  return { exportNames, ast, hasWildcardReExport }
}

/**
 * Transform a module to only export the specified identifiers.
 * All other exports are converted to local declarations and dead code is eliminated.
 * Returns null if no changes were made.
 */
export function transformExports(
  code: string,
  filename: string,
  exportsToKeep: Set<string>,
  options: TransformExportsOptions = {},
): GeneratorResult | null {
  // Extract all export names and get the AST in one pass
  // This allows early bailout if all exports are being kept
  const {
    exportNames: allExports,
    ast,
    hasWildcardReExport,
  } = getAllExportNames(code)

  // Early bailout: if we can enumerate all exports and all are being kept,
  // skip the expensive transformation (findReferencedIdentifiers, etc.)
  if (!hasWildcardReExport) {
    const allKept = [...allExports].every((name) => exportsToKeep.has(name))
    if (allKept) {
      // All exports are being kept, no transformation needed
      return null
    }
  }

  // Find all referenced identifiers before transformation
  const refIdents = findReferencedIdentifiers(ast)

  // Track if we actually modified anything
  let hasChanges = false

  babel.traverse(ast, {
    ExportNamedDeclaration(path) {
      const node = path.node

      if (node.declaration) {
        // export const/let/var foo = ..., export function bar() {}, export class Baz {}
        const names = getExportedNamesFromDeclaration(node.declaration)
        const keptNames = names.filter((name) => exportsToKeep.has(name))

        if (keptNames.length === names.length) {
          // All kept, no changes needed
          return
        }

        hasChanges = true

        if (keptNames.length === 0) {
          // None kept - convert entire declaration to local, let DCE handle unused parts
          path.replaceWith(node.declaration)
          // Add identifiers to refIdents so DCE can remove them if unused
          addBindingIdentifiersToRefIdents(path, refIdents)
        } else if (t.isVariableDeclaration(node.declaration)) {
          // Some kept - need to split variable declarations
          // e.g., `export const a = 1, b = 2, c = 3` with keep=[a,c]
          // becomes `export const a = 1, c = 3` + `const b = 2`
          const keptDeclarators: Array<t.VariableDeclarator> = []
          const removedDeclarators: Array<t.VariableDeclarator> = []

          for (const decl of node.declaration.declarations) {
            if (t.isIdentifier(decl.id) && exportsToKeep.has(decl.id.name)) {
              keptDeclarators.push(decl)
            } else {
              removedDeclarators.push(decl)
            }
          }

          // Replace the export with just the kept declarators
          node.declaration.declarations = keptDeclarators

          // If there are removed declarators, add them as a local declaration
          if (removedDeclarators.length > 0) {
            const localDecl = t.variableDeclaration(
              node.declaration.kind,
              removedDeclarators,
            )
            const [insertedPath] = path.insertAfter(localDecl)
            // Add identifiers to refIdents so DCE can remove them if unused
            addBindingIdentifiersToRefIdents(insertedPath, refIdents)
          }
        } else {
          // Unreachable for function/class: they export exactly one name,
          // so keptNames is either length 0 (handled above) or 1 (all kept, returned early)
          // Keep as defensive fallback
          path.replaceWith(node.declaration)
          // Add identifiers to refIdents so DCE can remove them if unused
          addBindingIdentifiersToRefIdents(path, refIdents)
        }
      } else if (node.specifiers.length > 0) {
        // export { foo, bar } or export { foo, bar } from './other'
        const keptSpecifiers = node.specifiers.filter((spec) => {
          if (t.isExportSpecifier(spec)) {
            return exportsToKeep.has(getExportedName(spec))
          }
          return false
        })

        if (keptSpecifiers.length === node.specifiers.length) {
          // All kept, no changes needed
          return
        }

        hasChanges = true

        if (keptSpecifiers.length > 0) {
          node.specifiers = keptSpecifiers
        } else {
          path.remove()
        }
      }
    },

    ExportDefaultDeclaration(path) {
      if (exportsToKeep.has('default')) {
        return
      }

      hasChanges = true

      const decl = path.node.declaration
      if (
        (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) &&
        decl.id
      ) {
        // Named: `export default function foo() {}` -> `function foo() {}`
        // Keep as local declaration so DCE can decide if it's referenced elsewhere
        path.replaceWith(decl)
        // Add identifiers to refIdents so DCE can remove them if unused
        addBindingIdentifiersToRefIdents(path, refIdents)
      } else {
        // Anonymous function/class or expression - just remove
        path.remove()
      }
    },

    // Note: ExportAllDeclaration (export * from './foo') is intentionally not handled
    // We leave these as-is and let the bundler tree-shake them
  })

  // hasChanges may remain false if:
  // - Module only has wildcard re-exports (export * from) which we preserve
  // - All named exports are in exportsToKeep (but we didn't bail out due to wildcard)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!hasChanges) {
    return null
  }

  // Run dead code elimination
  deadCodeElimination(ast, refIdents)

  return generateFromAst(ast, {
    sourceMaps: options.sourceMaps ?? true,
    sourceFileName: filename,
    filename,
  })
}
