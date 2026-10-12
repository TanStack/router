import MagicString from 'magic-string'
import { is, nameOf } from 'yuku-ast'
import {
  analyzeModule,
  importedNameOf,
  unwrapExpression,
} from '@tanstack/router-utils'
import type * as t from '@yuku-toolchain/types'
import type { TransformOptions, TransformResult } from './types'

const routeConstructors = ['createFileRoute', 'createLazyFileRoute'] as const

type RouteConstructorName = (typeof routeConstructors)[number]
type SupportedRouteId = t.StringLiteral | t.TemplateLiteral
type NamedImport = {
  imported: string
  local: string
  importKind?: 'type' | 'typeof' | 'value'
}

type ParsedImportDeclaration = {
  declaration: t.ImportDeclaration
  defaultImport?: string
  namespace?: string
  named: Array<NamedImport>
  moduleName: string
  quote: '"' | "'"
  semicolon: boolean
}

type RouteImportAnalysis =
  | { kind: 'ok' }
  | {
      kind: 'rename'
      imported: t.Identifier
      local: t.Identifier
      next: RouteConstructorName
    }
  | { kind: 'normalize' }

type RouteCall = {
  callee: t.Identifier
  /** The route constructor the callee is bound to. */
  constructor: RouteConstructorName
  /** The import the callee is bound to, under its own name or not. */
  imported: ReturnType<typeof importedNameOf>
  routeIdArg: SupportedRouteId
  optionsArg: t.CallExpression['arguments'][number] | undefined
}

type RouteCallAnalysis = {
  calls: Array<RouteCall>
  hasUnsupportedRouteId: boolean
  hasMalformedRouteCall: boolean
}

export function transform({
  ctx,
  source,
  filename,
  node,
}: TransformOptions): TransformResult {
  let ast: ReturnType<typeof analyzeModule>

  try {
    ast = analyzeModule({ code: source, filename })
  } catch (error) {
    return {
      result: 'error',
      error,
    }
  }

  // A runtime `export { x as Route }` of any binding, or `export const Route`
  const routeExport = ast.exports.find(
    (exp) =>
      exp.name === 'Route' &&
      exp.local &&
      !exp.typeOnly &&
      (is.ExportSpecifier(exp.node) ||
        is.VariableDeclarator(ast.parentOf(exp.node))),
  )

  if (!routeExport) {
    return { result: 'no-route-export' }
  }

  const {
    calls: routeCalls,
    hasUnsupportedRouteId,
    hasMalformedRouteCall,
  } = findRouteCalls(ast, routeExport.local!.declarations)

  if (routeCalls.length === 0 && hasMalformedRouteCall) {
    return {
      result: 'error',
      error: new Error(
        `expected Route export in ${ctx.routeId} to use createFileRoute('/path')({...}) or createLazyFileRoute('/path')({...})`,
      ),
    }
  }

  if (routeCalls.length === 0 && hasUnsupportedRouteId) {
    return {
      result: 'error',
      error: new Error(
        `expected route id to be a string literal or plain template literal in ${ctx.routeId}`,
      ),
    }
  }

  if (routeCalls.length === 0) {
    return { result: 'not-modified' }
  }

  if (routeCalls.length > 1) {
    return {
      result: 'error',
      error: new Error(
        `expected exactly one createFileRoute/createLazyFileRoute call in ${ctx.routeId}`,
      ),
    }
  }

  const routeCall = routeCalls[0]!
  const routeIdQuote = getRouteIdQuote(routeCall.routeIdArg)

  const createFileRouteProps = getCreateFileRouteProps(routeCall.optionsArg)
  if (createFileRouteProps) {
    node.createFileRouteProps = createFileRouteProps
  }

  const expectedCallee = getExpectedRouteConstructor(ctx.lazy)
  const expectedRouteId = `${routeIdQuote}${ctx.routeId}${routeIdQuote}`
  const currentRouteId = source.slice(
    routeCall.routeIdArg.start,
    routeCall.routeIdArg.end,
  )
  const targetModule = `@tanstack/${ctx.target}-router`
  const imports = parseTargetImports(ast.ast.body, source, targetModule)

  const s = new MagicString(source)
  let modified = false

  // The callee already reads the expected constructor from the target
  // module, possibly under another name or through a type-only import
  const imported = routeCall.imported
  const boundToExpected =
    routeCall.constructor === expectedCallee &&
    imported?.source === targetModule
  // An import under another name or a type-only one is the callee's binding:
  // keep it rather than normalize imports by name around it
  const keepImports =
    boundToExpected &&
    (routeCall.callee.name !== expectedCallee || imported.typeOnly)

  if (!boundToExpected && routeCall.callee.name !== expectedCallee) {
    s.update(routeCall.callee.start, routeCall.callee.end, expectedCallee)
    modified = true
  }

  // A type-only import is erased: make the one the route call reads a value
  if (keepImports && imported.typeOnly) {
    makeValueImport(ast, routeCall.callee, s)
    modified = true
  }

  if (currentRouteId !== expectedRouteId) {
    s.update(
      routeCall.routeIdArg.start,
      routeCall.routeIdArg.end,
      expectedRouteId,
    )
    modified = true
  }

  if (
    !keepImports &&
    updateRouteImports({
      imports,
      source,
      s,
      targetModule,
      required: expectedCallee,
      lineEnding: getLineEnding(source),
    })
  ) {
    modified = true
  }

  if (!modified) {
    return { result: 'not-modified' }
  }

  return {
    result: 'modified',
    output: s.toString(),
  }
}

function findRouteCalls(
  module: ReturnType<typeof analyzeModule>,
  declarations: Array<t.Node>,
): RouteCallAnalysis {
  const calls: Array<RouteCall> = []
  let hasUnsupportedRouteId = false
  let hasMalformedRouteCall = false

  for (const declaration of declarations) {
    const declarator = module.parentOf(declaration)
    if (!is.VariableDeclarator(declarator)) {
      continue
    }

    const init = getRouteConstructorInit(module, declarator.init)
    if (!init) {
      const call = unwrapExpression(declarator.init)
      if (is.CallExpression(call) && routeConstructorOf(module, call.callee)) {
        hasMalformedRouteCall = true
      }
      continue
    }

    const routeIdArg = unwrapExpression(init.innerCall.arguments[0])
    if (isSupportedRouteId(routeIdArg)) {
      calls.push({
        callee: init.callee,
        constructor: init.constructor,
        imported: init.imported,
        routeIdArg,
        optionsArg: unwrapExpression(init.outerCall.arguments[0]),
      })
    } else {
      hasUnsupportedRouteId = true
    }
  }

  return { calls, hasUnsupportedRouteId, hasMalformedRouteCall }
}

/**
 * The route constructor a callee is bound to: the one it imports, under its
 * own name or not, else the one it is named after.
 */
function routeConstructorOf(
  module: ReturnType<typeof analyzeModule>,
  node: t.Expression | t.Super,
) {
  const callee = unwrapExpression(node)
  if (!is.Identifier(callee)) {
    return null
  }
  const imported = importedNameOf(module, callee)
  const name = imported ? imported.name : callee.name
  return isRouteConstructorName(name)
    ? { callee, constructor: name, imported }
    : null
}

function getRouteConstructorInit(
  module: ReturnType<typeof analyzeModule>,
  expression: t.Expression | null,
) {
  const outerCall = unwrapExpression(expression)
  if (!is.CallExpression(outerCall)) {
    return null
  }
  const innerCall = unwrapExpression(outerCall.callee)
  const constructor =
    is.CallExpression(innerCall) && routeConstructorOf(module, innerCall.callee)
  if (!constructor) {
    return null
  }

  return { ...constructor, outerCall, innerCall }
}

/**
 * Turns the type-only import an identifier is bound to into a value import:
 * drops its `type` modifier, or the declaration's when it imports nothing
 * else, keeping its other specifiers type-only.
 */
function makeValueImport(
  module: ReturnType<typeof analyzeModule>,
  identifier: t.Identifier,
  s: MagicString,
) {
  const [local] = module.bindingOf(identifier)?.declarations ?? []
  const specifier = local && module.parentOf(local)
  const declaration = specifier && module.parentOf(specifier)
  if (!is.ImportSpecifier(specifier) || !is.ImportDeclaration(declaration)) {
    return
  }
  const typeKeyword = (start: number, end: number) => {
    const match = /\btype\s+/.exec(module.source.slice(start, end))
    if (match) {
      s.remove(start + match.index, start + match.index + match[0].length)
    }
  }
  if (specifier.importKind === 'type') {
    typeKeyword(specifier.start, specifier.imported.start)
    return
  }
  typeKeyword(declaration.start, declaration.specifiers[0]!.start)
  for (const other of declaration.specifiers) {
    if (other !== specifier) {
      s.prependLeft(other.start, 'type ')
    }
  }
}

function isSupportedRouteId(
  arg: t.CallExpression['arguments'][number] | undefined,
): arg is SupportedRouteId {
  return (
    !!arg &&
    (is.StringLiteral(arg) ||
      (is.TemplateLiteral(arg) && arg.expressions.length === 0))
  )
}

function getRouteIdQuote(arg: SupportedRouteId): '"' | "'" | '`' {
  return is.StringLiteral(arg) ? (arg.raw[0] as '"' | "'") : '`'
}

function getCreateFileRouteProps(
  arg: t.CallExpression['arguments'][number] | undefined,
) {
  if (!arg || !is.ObjectExpression(arg)) {
    return undefined
  }

  const props = new Set<string>()

  for (const property of arg.properties) {
    if (!is.Property(property) || property.computed) {
      continue
    }

    const name = nameOf(property.key)
    if (name !== null) {
      props.add(name)
    }
  }

  return props
}

function parseTargetImports(
  body: t.Program['body'],
  source: string,
  targetModule: string,
) {
  const imports: Array<ParsedImportDeclaration> = []

  for (const statement of body) {
    if (
      !is.ImportDeclaration(statement) ||
      statement.importKind === 'type' ||
      statement.source.value !== targetModule
    ) {
      continue
    }

    const rawSource = source.slice(statement.source.start, statement.source.end)
    const importStatement = source.slice(statement.start, statement.end)

    imports.push({
      declaration: statement,
      defaultImport: statement.specifiers.find((specifier) =>
        is.ImportDefaultSpecifier(specifier),
      )?.local.name,
      namespace: statement.specifiers.find((specifier) =>
        is.ImportNamespaceSpecifier(specifier),
      )?.local.name,
      named: statement.specifiers
        .filter((specifier): specifier is t.ImportSpecifier =>
          is.ImportSpecifier(specifier),
        )
        .map((specifier) => ({
          imported: nameOf(specifier.imported),
          local: specifier.local.name,
          importKind: specifier.importKind ?? undefined,
        })),
      moduleName: statement.source.value,
      quote: rawSource[0] as '"' | "'",
      semicolon: importStatement.trimEnd().endsWith(';'),
    })
  }

  return imports
}

function updateRouteImports({
  imports,
  source,
  s,
  targetModule,
  required,
  lineEnding,
}: {
  imports: Array<ParsedImportDeclaration>
  source: string
  s: MagicString
  targetModule: string
  required: RouteConstructorName
  lineEnding: '\r\n' | '\n' | '\r'
}) {
  const analysis = analyzeRouteImports(imports, required)

  if (analysis.kind === 'ok') {
    return false
  }

  if (analysis.kind === 'rename') {
    s.update(analysis.imported.start, analysis.imported.end, analysis.next)
    s.update(analysis.local.start, analysis.local.end, analysis.next)
    return true
  }

  return normalizeRouteImports({
    imports,
    source,
    s,
    targetModule,
    required,
    lineEnding,
  })
}

function analyzeRouteImports(
  imports: Array<ParsedImportDeclaration>,
  required: RouteConstructorName,
): RouteImportAnalysis {
  const opposite = getOtherRouteConstructor(required)
  let requiredCount = 0
  let oppositeCount = 0
  let renameCandidate:
    | {
        imported: t.Identifier
        local: t.Identifier
        next: RouteConstructorName
      }
    | undefined

  for (const declaration of imports) {
    for (const specifier of declaration.declaration.specifiers) {
      if (!is.ImportSpecifier(specifier)) {
        continue
      }

      const imported = specifier.imported
      if (!is.Identifier(imported)) {
        return { kind: 'normalize' }
      }

      if (!isRouteConstructorName(imported.name)) {
        continue
      }

      if (specifier.local.name !== imported.name) {
        return { kind: 'normalize' }
      }

      if (imported.name === required) {
        requiredCount++
        continue
      }

      if (imported.name === opposite) {
        oppositeCount++
        renameCandidate = {
          imported,
          local: specifier.local,
          next: required,
        }
      }
    }
  }

  if (requiredCount === 1 && oppositeCount === 0) {
    return { kind: 'ok' }
  }

  if (requiredCount === 0 && oppositeCount === 1 && renameCandidate) {
    return {
      kind: 'rename',
      ...renameCandidate,
    }
  }

  return { kind: 'normalize' }
}

function normalizeRouteImports({
  imports,
  source,
  s,
  targetModule,
  required,
  lineEnding,
}: {
  imports: Array<ParsedImportDeclaration>
  source: string
  s: MagicString
  targetModule: string
  required: RouteConstructorName
  lineEnding: '\r\n' | '\n' | '\r'
}) {
  const owner =
    imports.find((declaration) =>
      hasNamedImport(declaration.named, required),
    ) ?? imports.find((declaration) => !declaration.namespace)

  let modified = false

  for (const declaration of imports) {
    const named = normalizeNamedImports({
      named: declaration.named,
      required,
      isOwner: declaration === owner,
    })

    if (sameNamedImports(declaration.named, named)) {
      continue
    }

    const replacement = renderImportDeclaration({
      ...declaration,
      named,
    })

    if (replacement === null) {
      s.remove(
        declaration.declaration.start,
        getRemovalEnd(source, declaration.declaration.end),
      )
      modified = true
      continue
    }

    s.update(
      declaration.declaration.start,
      declaration.declaration.end,
      replacement,
    )
    modified = true
  }

  if (!owner) {
    const quote = imports[0]?.quote ?? "'"
    const semicolon = imports[0]?.semicolon ?? false
    s.prepend(
      `import { ${required} } from ${quote}${targetModule}${quote}${semicolon ? ';' : ''}${lineEnding}`,
    )
    modified = true
  }

  return modified
}

function normalizeNamedImports({
  named,
  required,
  isOwner,
}: {
  named: Array<NamedImport>
  required: RouteConstructorName
  isOwner: boolean
}) {
  const banned = getOtherRouteConstructor(required)
  const nextNamed: Array<NamedImport> = []
  const seen = new Set<string>()

  for (const specifier of named) {
    if (specifier.imported === banned) {
      continue
    }

    if (
      specifier.local === required &&
      (specifier.imported !== required || !isOwner)
    ) {
      continue
    }

    const key = `${specifier.importKind ?? 'value'}:${specifier.imported}:${specifier.local}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    nextNamed.push(specifier)
  }

  if (isOwner && !hasNamedImport(nextNamed, required)) {
    nextNamed.push({ imported: required, local: required })
  }

  return nextNamed
}

function getExpectedRouteConstructor(lazy: boolean): RouteConstructorName {
  return lazy ? 'createLazyFileRoute' : 'createFileRoute'
}

function getOtherRouteConstructor(
  constructor: RouteConstructorName,
): RouteConstructorName {
  return constructor === 'createFileRoute'
    ? 'createLazyFileRoute'
    : 'createFileRoute'
}

function hasNamedImport(
  named: Array<NamedImport>,
  required: RouteConstructorName,
) {
  return named.some(
    (specifier) =>
      specifier.imported === required &&
      specifier.local === required &&
      specifier.importKind !== 'type',
  )
}

function sameNamedImports(left: Array<NamedImport>, right: Array<NamedImport>) {
  return (
    left.length === right.length &&
    left.every(
      (specifier, index) =>
        specifier.imported === right[index]!.imported &&
        specifier.local === right[index]!.local &&
        specifier.importKind === right[index]!.importKind,
    )
  )
}

function isRouteConstructorName(value: string): value is RouteConstructorName {
  return routeConstructors.includes(value as RouteConstructorName)
}

function renderImportDeclaration(importDeclaration: {
  defaultImport?: string
  namespace?: string
  named: Array<NamedImport>
  moduleName: string
  quote: '"' | "'"
  semicolon: boolean
}) {
  const parts: Array<string> = []

  if (importDeclaration.defaultImport) {
    parts.push(importDeclaration.defaultImport)
  }

  if (importDeclaration.namespace) {
    parts.push(`* as ${importDeclaration.namespace}`)
  }

  if (importDeclaration.named.length > 0) {
    parts.push(
      `{ ${importDeclaration.named
        .map(
          (specifier) =>
            `${specifier.importKind === 'type' ? 'type ' : ''}${specifier.imported === specifier.local ? specifier.imported : `${specifier.imported} as ${specifier.local}`}`,
        )
        .join(', ')} }`,
    )
  }

  if (parts.length === 0) {
    return null
  }

  return `import ${parts.join(', ')} from ${importDeclaration.quote}${importDeclaration.moduleName}${importDeclaration.quote}${importDeclaration.semicolon ? ';' : ''}`
}

function getLineEnding(source: string): '\r\n' | '\n' | '\r' {
  if (source.includes('\r\n')) {
    return '\r\n'
  }

  if (source.includes('\n')) {
    return '\n'
  }

  if (source.includes('\r')) {
    return '\r'
  }

  return '\n'
}

function getRemovalEnd(source: string, end: number) {
  let pos = end
  while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t')) {
    pos++
  }

  if (source[pos] === '\r' && source[pos + 1] === '\n') {
    return pos + 2
  }

  if (source[pos] === '\n' || source[pos] === '\r') {
    return pos + 1
  }

  return end
}
