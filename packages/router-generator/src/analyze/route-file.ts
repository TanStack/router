import { parse } from 'yuku'
import { unwrap } from 'yuku/utils'
import { lit } from '../print/style'
import type { CodeStyle } from '../print/style'
import type { RouteProps } from '../types'
import type { CallExpression, Expression, Node, SourceFile } from 'yuku'

export type RouteConstructorName = 'createFileRoute' | 'createLazyFileRoute'

const routeConstructors: ReadonlyArray<string> = [
  'createFileRoute',
  'createLazyFileRoute',
]

/** A problem in a route file, at a position of its source. */
export interface FileDiagnostic {
  severity: 'warning' | 'error'
  message: string
  /** 1-based line and column, when the problem has a position. */
  line?: number
  column?: number
}

export type RouteFileAnalysis =
  /** The file does not parse: nothing else is known. */
  | { kind: 'error'; diagnostics: Array<FileDiagnostic> }
  /** The file exports no `Route`. */
  | { kind: 'no-route' }
  /**
   * The file exports a `Route`. `output` is the file with its id and
   * constructor kept up, or null when it needs no edit (or is not ours to
   * edit: a route made by another module or factory, which is left as it
   * is).
   */
  | {
      kind: 'route'
      output: string | null
      props: RouteProps
      diagnostics: Array<FileDiagnostic>
    }

export interface RouteFileExpectation {
  /** The route id the file's location implies. */
  routeId: string
  /** Whether the file is a `.lazy` route file (`createLazyFileRoute`). */
  lazy: boolean
  /** The router package the constructor comes from (`@tanstack/react-router`). */
  routerPackage: string
  /** The style of an import the file gets, when it has no import to copy it from. */
  style: CodeStyle
}

interface Splice {
  start: number
  end: number
  text: string
}

const unknownProps: RouteProps = { known: new Set(), unknown: true }

function langOf(file: string) {
  // `.ts` files are TypeScript without JSX (`<T>x` is a type assertion);
  // every other script is read as TSX, which also covers JSX in `.js`.
  return /\.[mc]?ts$/.test(file) ? 'ts' : 'tsx'
}

function lineEndingOf(source: string): '\r\n' | '\n' | '\r' {
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

function applySplices(source: string, splices: Array<Splice>) {
  let output = source
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, splice.start) + splice.text + output.slice(splice.end)
  }
  return output
}

function diagnosticAt(
  file: SourceFile,
  offset: number,
  severity: FileDiagnostic['severity'],
  message: string,
): FileDiagnostic {
  const { line, column } = file.locate(offset)
  return { severity, message, line, column: column + 1 }
}

/** The option keys of a route's options argument (SPEC J1.9). */
function propsOf(options: Node | undefined): RouteProps {
  if (!options) {
    return { known: new Set(), unknown: false }
  }
  const object = unwrap(options as Expression)
  if (object.type !== 'ObjectExpression') {
    return unknownProps
  }
  const known = new Set<string>()
  let unknown = false
  for (const property of object.properties) {
    if (property.type !== 'Property') {
      // A spread: any key
      unknown = true
      continue
    }
    const keyNode = property.key as Node
    if (!property.computed && keyNode.type === 'Identifier') {
      known.add((keyNode as { name: string }).name)
    } else if (
      keyNode.type === 'Literal' &&
      typeof (keyNode as { value: unknown }).value === 'string'
    ) {
      known.add((keyNode as { value: string }).value)
    } else if (
      !property.computed &&
      keyNode.type === 'Literal' &&
      typeof (keyNode as { value: unknown }).value === 'number'
    ) {
      known.add(String((keyNode as { value: number }).value))
    } else {
      unknown = true
    }
  }
  return { known, unknown }
}

/**
 * How the file creates its Route, found through the binding of the
 * constructor (SPEC G15): the router package's constructor under any local
 * name or through a namespace import (`ours`), an unbound
 * `createFileRoute`/`createLazyFileRoute` (`repair`: the import is missing),
 * or anything else (`foreign`: the app's own constructor or factory).
 */
type CalleeKind =
  | { kind: 'ours'; name: RouteConstructorName; specifier?: Node }
  | { kind: 'ours-namespace'; name: RouteConstructorName; property: Node }
  | { kind: 'repair'; name: RouteConstructorName }
  | { kind: 'foreign' }

function classifyCallee(
  file: SourceFile,
  callee: Node,
  routerPackage: string,
): CalleeKind {
  if (callee.type === 'Identifier') {
    const name = (callee as { name: string }).name
    const binding = file.referenceOf(callee)?.binding ?? null
    if (!binding) {
      return routeConstructors.includes(name)
        ? { kind: 'repair', name: name as RouteConstructorName }
        : { kind: 'foreign' }
    }
    const imported = binding.import
    if (
      imported &&
      imported.kind === 'named' &&
      !imported.typeOnly &&
      imported.specifier === routerPackage &&
      imported.name !== null &&
      routeConstructors.includes(imported.name)
    ) {
      return {
        kind: 'ours',
        name: imported.name as RouteConstructorName,
        specifier: imported.node,
      }
    }
    return { kind: 'foreign' }
  }
  if (
    callee.type === 'MemberExpression' &&
    !(callee as { computed: boolean }).computed
  ) {
    const { object, property } = callee as unknown as {
      object: Node
      property: Node & { name: string }
    }
    if (
      object.type === 'Identifier' &&
      routeConstructors.includes(property.name)
    ) {
      const imported = file.referenceOf(object)?.binding?.import
      if (
        imported &&
        imported.kind === 'namespace' &&
        !imported.typeOnly &&
        imported.specifier === routerPackage
      ) {
        return {
          kind: 'ours-namespace',
          name: property.name as RouteConstructorName,
          property,
        }
      }
    }
  }
  return { kind: 'foreign' }
}

/** A callee as written (`createFileRoute`, `R.createFileRoute`). */
function calleeName(callee: Node): string {
  if (callee.type === 'Identifier') {
    return (callee as { name: string }).name
  }
  if (callee.type === 'MemberExpression') {
    const { object, property } = callee as unknown as {
      object: Node
      property: Node
    }
    return `${calleeName(object)}.${calleeName(property)}`
  }
  return 'its constructor'
}

/** Whether `callee` is bound to an `import type` (or `import { type … }`). */
function isTypeOnlyImport(file: SourceFile, callee: Node) {
  const object =
    callee.type === 'MemberExpression'
      ? (callee as unknown as { object: Node }).object
      : callee
  return (
    object.type === 'Identifier' &&
    file.referenceOf(object)?.binding?.import?.typeOnly === true
  )
}

/** The start of the first statement after the directive prologue. */
function headerInsertOffset(file: SourceFile) {
  for (const statement of file.program.body) {
    if (
      statement.type === 'ExpressionStatement' &&
      typeof (statement as { directive?: unknown }).directive === 'string'
    ) {
      continue
    }
    return statement.start
  }
  return file.source.length
}

function isStringLiteral(node: Node | undefined): node is Node & {
  value: string
} {
  return (
    node?.type === 'Literal' &&
    typeof (node as { value: unknown }).value === 'string'
  )
}

/**
 * Reads a route file and computes the edits that keep it up (SPEC J1.1,
 * J1.2): the id argument of its Route's constructor call, the constructor
 * of its kind, and that constructor's import. Every other byte stays: the
 * edits are offset splices.
 */
export function analyzeRouteFile(
  source: string,
  filePath: string,
  expected: RouteFileExpectation,
): RouteFileAnalysis {
  // (no `Route` anywhere: no Route export, without parsing)
  if (!source.includes('Route')) {
    return { kind: 'no-route' }
  }
  const file = parse(source, {
    lang: langOf(filePath),
    sourceType: 'module',
    analyze: true,
  })
  const errors = file.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length) {
    return {
      kind: 'error',
      diagnostics: errors.map((d) =>
        diagnosticAt(file, d.start, 'error', d.message),
      ),
    }
  }

  const routeExport = file.exports.find(
    (e) => e.name === 'Route' && !e.typeOnly,
  )
  if (!routeExport) {
    return { kind: 'no-route' }
  }
  // Not a route this file creates (re-exported, imported, destructured,
  // a function...): left as it is.
  const notOurs = (diagnostics: Array<FileDiagnostic> = []) =>
    ({
      kind: 'route',
      output: null,
      props: unknownProps,
      diagnostics,
    }) as const

  const binding = routeExport.kind === 'named' ? routeExport.local : null
  const declaredName = binding?.declarations[0]
  const declarator = declaredName ? file.parentOf(declaredName) : null
  if (
    !declarator ||
    declarator.type !== 'VariableDeclarator' ||
    (declarator as { id: Node }).id !== declaredName
  ) {
    return notOurs()
  }
  const init = unwrap(
    (declarator as { init: Expression | null }).init ?? undefined,
  )
  if (init?.type !== 'CallExpression') {
    return notOurs()
  }

  // `createFileRoute('/id')(options)`, or the malformed
  // `createFileRoute(options)`
  const outer = init
  const innerCallee = unwrap(outer.callee)
  let callee: Node
  let idCall: CallExpression | undefined
  let options: Node | undefined
  if (
    innerCallee.type === 'CallExpression' &&
    classifyCallee(file, unwrap(innerCallee.callee), expected.routerPackage)
      .kind !== 'foreign'
  ) {
    idCall = innerCallee
    callee = unwrap(idCall.callee)
    options = outer.arguments[0]
  } else if (
    classifyCallee(file, innerCallee, expected.routerPackage).kind !==
      'foreign' &&
    !isStringLiteral(outer.arguments[0])
  ) {
    callee = innerCallee
    options = outer.arguments[0]
  } else {
    // The app's own constructor or route factory: its route is left as the
    // app makes it. Its id is not kept up, which the user is told when it
    // visibly differs.
    const inner = innerCallee.type === 'CallExpression' ? innerCallee : outer
    const idArg = inner.arguments[0]
    if (isStringLiteral(idArg) && idArg.value !== expected.routeId) {
      const reason =
        inner === outer
          ? // `createFileRoute('/id')` without the options call
            `calls ${calleeName(innerCallee)}(${JSON.stringify(idArg.value)}) without route options (\`${calleeName(innerCallee)}(${JSON.stringify(expected.routeId)})({ ... })\`)`
          : isTypeOnlyImport(file, unwrap(inner.callee))
            ? `uses ${calleeName(unwrap(inner.callee))}, imported as a type only`
            : `is not created by createFileRoute/createLazyFileRoute of ${expected.routerPackage}`
      return notOurs([
        diagnosticAt(
          file,
          idArg.start,
          'warning',
          `The Route of ${filePath} ${reason}: its route id ${JSON.stringify(idArg.value)} is not updated to ${JSON.stringify(expected.routeId)}.`,
        ),
      ])
    }
    return notOurs()
  }

  const calleeKind = classifyCallee(file, callee, expected.routerPackage)
  if (calleeKind.kind === 'foreign') {
    return notOurs()
  }
  const props = propsOf(options)
  const splices: Array<Splice> = []
  const quoteOf = (node: Node) => {
    const first = source[node.start]
    return first === '"' || first === "'" ? first : expected.style.quote
  }

  // The id argument
  let idText = ''
  if (idCall) {
    const idArg = idCall.arguments[0]
    if (!idArg) {
      // `createFileRoute()`: the id goes between the parentheses
      splices.push({
        start: idCall.end - 1,
        end: idCall.end - 1,
        text: lit(expected.routeId, expected.style.quote),
      })
    } else if (isStringLiteral(idArg)) {
      if (idArg.value !== expected.routeId) {
        splices.push({
          start: idArg.start,
          end: idArg.end,
          text: lit(expected.routeId, quoteOf(idArg)),
        })
      }
    } else if (
      idArg.type === 'TemplateLiteral' &&
      (idArg as unknown as { expressions: Array<Node> }).expressions.length ===
        0
    ) {
      const quasis = (
        idArg as unknown as { quasis: Array<{ value: { cooked: string } }> }
      ).quasis
      if (quasis[0]?.value.cooked !== expected.routeId) {
        splices.push({
          start: idArg.start,
          end: idArg.end,
          text: lit(expected.routeId, expected.style.quote),
        })
      }
    } else {
      // An id computed at runtime: the file is left as it is
      return {
        kind: 'route',
        output: null,
        props,
        diagnostics: [
          diagnosticAt(
            file,
            idArg.start,
            'warning',
            `The route id of ${filePath} is not a string literal, so it cannot be kept up: use ${lit(expected.routeId)}.`,
          ),
        ],
      }
    }
  } else {
    // Malformed `createFileRoute(options)`: repaired into the curried call
    idText = `(${lit(expected.routeId, expected.style.quote)})`
  }

  // The constructor of the file's kind
  const wanted: RouteConstructorName = expected.lazy
    ? 'createLazyFileRoute'
    : 'createFileRoute'
  let calleeText = source.slice(callee.start, callee.end)
  if (calleeKind.kind === 'ours-namespace') {
    if (calleeKind.name !== wanted) {
      const { property } = calleeKind
      calleeText =
        source.slice(callee.start, property.start) +
        wanted +
        source.slice(property.end, callee.end)
    }
  } else if (calleeKind.kind === 'repair' || calleeKind.name !== wanted) {
    calleeText = bindConstructor(file, source, expected, wanted, calleeKind, {
      splices,
      callee,
    })
  }
  calleeText += idText
  if (calleeText !== source.slice(callee.start, callee.end)) {
    splices.push({ start: callee.start, end: callee.end, text: calleeText })
  }

  return {
    kind: 'route',
    output: splices.length ? applySplices(source, splices) : null,
    props,
    diagnostics: [],
  }
}

/**
 * A local name bound to the router's `wanted` constructor at the Route's
 * call, adding the import edits that need: an existing value import of it
 * (any alias), the file's import of the other constructor switched in place
 * when the call is its only use, or a new import (under a fresh name when
 * the file uses the name for something else).
 */
function bindConstructor(
  file: SourceFile,
  source: string,
  expected: RouteFileExpectation,
  wanted: RouteConstructorName,
  calleeKind: CalleeKind,
  { splices, callee }: { splices: Array<Splice>; callee: Node },
): string {
  const existing = file.imports.find(
    (i) =>
      i.kind === 'named' &&
      !i.typeOnly &&
      i.specifier === expected.routerPackage &&
      i.name === wanted &&
      i.local,
  )
  if (existing?.local) {
    return existing.local.name
  }

  const nameFree = (name: string) =>
    file.rootScope.lookup(name) === null &&
    !file.references.some(
      (reference) => reference.name === name && reference.node !== callee,
    )

  if (calleeKind.kind === 'ours' && calleeKind.specifier) {
    const specifier = calleeKind.specifier as Node & {
      imported: Node & { type: string }
      local: Node & { name: string }
    }
    const binding = file.referenceOf(callee)?.binding
    const uses = binding?.references.filter((r) => !r.inTypePosition) ?? []
    if (
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.type === 'Identifier' &&
      specifier.imported.start === specifier.local.start &&
      uses.length === 1 &&
      uses[0]!.node === callee &&
      nameFree(wanted)
    ) {
      // `import { createLazyFileRoute }` used only by this call: switched
      splices.push({
        start: specifier.start,
        end: specifier.end,
        text: wanted,
      })
      return wanted
    }
  }

  let local: string = wanted
  if (calleeKind.kind !== 'repair' || calleeKind.name !== wanted) {
    for (let n = 2; !nameFree(local); n++) {
      local = `${wanted}${n}`
    }
  } else if (file.rootScope.lookup(wanted) !== null) {
    for (let n = 2; !nameFree(local); n++) {
      local = `${wanted}${n}`
    }
  }

  // The new import copies the quotes and semicolons of the file's first
  // import, and goes after the directive prologue and any header comments
  // (license, pragmas).
  const firstImport = file.program.body.find(
    (statement) => statement.type === 'ImportDeclaration',
  ) as (Node & { source: Node }) | undefined
  const quote = firstImport
    ? (source[firstImport.source.start] as "'" | '"')
    : expected.style.quote
  const semicolon = firstImport
    ? source.slice(firstImport.start, firstImport.end).endsWith(';')
    : expected.style.semicolons
  const offset = headerInsertOffset(file)
  splices.push({
    start: offset,
    end: offset,
    text: `import { ${local === wanted ? wanted : `${wanted} as ${local}`} } from ${lit(expected.routerPackage, quote)}${semicolon ? ';' : ''}${lineEndingOf(source)}`,
  })
  return local
}
