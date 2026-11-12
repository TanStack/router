import { parse } from 'yuku'
import { unwrap } from 'yuku/utils'
import { lit } from '../print/style'
import { propertyKeyName, routeCallOf } from './route-call'
import type {
  ForeignRoute,
  RouteCall,
  RouteConstructorName,
  RouteFileKind,
} from './route-call'
import type { CodeStyle } from '../print/style'
import type { RouteProps } from '../types'
import type { Expression, Node, SourceFile } from 'yuku'

/** A problem in a route file, at a position of its source. */
export interface FileDiagnostic {
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
      /**
       * Whether `Route` is made by something other than the router package's
       * route constructor (`routeCallOf`): the app's own constructor or
       * factory, a re-export, an import. A compiler may take the router's
       * own route as a value it knows (no Start value) without reading the
       * file; a foreign one it must read.
       */
      foreign: boolean
      diagnostics: Array<FileDiagnostic>
    }

interface RouteFileExpectation {
  /** The route id the file's location implies. */
  routeId: string
  /** The file's kind (`createRootRoute`, `createFileRoute`, `createLazyFileRoute`). */
  kind: RouteFileKind
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

function parseRouteFile(source: string, filePath: string): SourceFile {
  return parse(source, {
    lang: langOf(filePath),
    sourceType: 'module',
    analyze: true,
  })
}

function errorsOf(file: SourceFile): Array<FileDiagnostic> {
  return file.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => diagnosticAt(file, d.start, d.message))
}

function diagnosticAt(
  file: SourceFile,
  offset: number,
  message: string,
): FileDiagnostic {
  const { line, column } = file.locate(offset)
  return { message, line, column: column + 1 }
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
    const key = propertyKeyName(property)
    if (key === null) {
      // a spread or a computed key: any key
      unknown = true
    } else {
      known.add(key)
    }
  }
  return { known, unknown }
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

/** A license or JSX pragma comment: it leads the file, above an added import. */
const leadingCommentRe = /^\/\*!|@license|@preserve|@jsx/

/**
 * Where an added import goes: after the directive prologue and the
 * comments leading the file, before the comments the first statement starts
 * with (no blank line between them and it, license and pragmas aside).
 */
function headerInsertOffset(file: SourceFile) {
  let prologueEnd = 0
  for (const statement of file.program.body) {
    if (
      statement.type === 'ExpressionStatement' &&
      typeof (statement as { directive?: unknown }).directive === 'string'
    ) {
      prologueEnd = statement.end
      continue
    }
    let at = statement.start
    const leading = file.comments.filter(
      (c) => c.start >= prologueEnd && c.end <= statement.start,
    )
    for (let i = leading.length - 1; i >= 0; i--) {
      const c = leading[i]!
      if (
        /\n[^\S\n]*\r?\n/.test(file.source.slice(c.end, at)) ||
        leadingCommentRe.test(file.source.slice(c.start, c.end))
      ) {
        break
      }
      at = c.start
    }
    return at
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
  const file = parseRouteFile(source, filePath)
  const errors = errorsOf(file)
  if (errors.length) {
    return { kind: 'error', diagnostics: errors }
  }

  const call = routeCallOf(file, expected)
  if (call.kind === 'none') {
    return { kind: 'no-route' }
  }
  if (call.kind === 'foreign') {
    // Not a route this file creates (re-exported, imported, destructured,
    // the app's own route helper...): left as it is.
    return {
      kind: 'route',
      output: null,
      props: unknownProps,
      foreign: true,
      diagnostics:
        expected.kind === 'root'
          ? []
          : foreignCallDiagnostics(file, call.reason, expected),
    }
  }

  const props = propsOf(call.options)
  const splices: Array<Splice> = []
  const diagnostics: Array<FileDiagnostic> = []
  const quoteOf = (node: Node) => {
    const first = source[node.start]
    return first === '"' || first === "'" ? first : expected.style.quote
  }
  const { callee, idCall } = call

  // The id argument
  if (
    expected.kind !== 'root' &&
    idCall &&
    call.constructor !== 'createRootRouteWithContext'
  ) {
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
      // An id computed at runtime: left as it is, and reported (the
      // constructor below is still the generator's to keep up: a route
      // compiler waits for that repair)
      diagnostics.push(
        diagnosticAt(
          file,
          idArg.start,
          `The route id is not a string literal, so the generator cannot keep it in sync with the file's path: write ${lit(expected.routeId)}.`,
        ),
      )
    }
  }

  // The constructor of the file's kind (R144: a root constructor in a route
  // file and a file route constructor in the root route file too)
  const wanted: RouteConstructorName =
    expected.kind === 'root'
      ? 'createRootRoute'
      : expected.kind === 'lazy'
        ? 'createLazyFileRoute'
        : 'createFileRoute'
  const keeps =
    call.constructor === wanted ||
    (expected.kind === 'root' &&
      call.constructor === 'createRootRouteWithContext')
  let calleeText = source.slice(callee.start, callee.end)
  if (!keeps || isUnbound(call)) {
    if (call.property) {
      const { property } = call
      calleeText =
        source.slice(callee.start, property.start) +
        wanted +
        source.slice(property.end, callee.end)
    } else {
      calleeText = bindConstructor(file, source, expected, wanted, call, {
        splices,
        callee,
      })
    }
  }
  const idText = `(${lit(expected.routeId, expected.style.quote)})`
  if (expected.kind === 'root') {
    if (!keeps) {
      // `createFileRoute('/x')(options)` and `createFileRoute(options)`:
      // `createRootRoute(options)`
      const replaced = idCall ?? callee
      splices.push({
        start: replaced.start,
        end: replaced.end,
        text: calleeText,
      })
    }
  } else if (call.constructor === 'createRootRouteWithContext' && idCall) {
    // `createRootRouteWithContext<C>()(options)`: `createFileRoute('/x')(options)`
    splices.push({
      start: idCall.start,
      end: idCall.end,
      text: calleeText + idText,
    })
  } else {
    // (a call without an id call, `createFileRoute(options)` or
    // `createRootRoute(options)`, is repaired into the curried call)
    const text = idCall ? calleeText : calleeText + idText
    if (text !== source.slice(callee.start, callee.end)) {
      splices.push({ start: callee.start, end: callee.end, text })
    }
  }

  return {
    kind: 'route',
    output: splices.length ? applySplices(source, splices) : null,
    props,
    foreign: false,
    diagnostics,
  }
}

/**
 * What the generator tells about a `Route` it does not keep up, when it is
 * the router's own constructor misused (SPEC J1.1) and its id is stale:
 * called without the options call, or imported as a type only. A route
 * made by the app's own helper gets nothing (R130).
 */
function foreignCallDiagnostics(
  file: SourceFile,
  reason: ForeignRoute,
  expected: RouteFileExpectation,
): Array<FileDiagnostic> {
  if (reason.kind !== 'no-options' && reason.kind !== 'type-only') {
    return []
  }
  const idArg = reason.idCall?.arguments[0]
  if (!isStringLiteral(idArg) || idArg.value === expected.routeId) {
    return []
  }
  const name = calleeName(reason.callee)
  const problem =
    reason.kind === 'no-options'
      ? `calls ${name}(${JSON.stringify(idArg.value)}) without route options (\`${name}(${JSON.stringify(expected.routeId)})({ ... })\`)`
      : `uses ${name}, imported as a type only`
  return [
    diagnosticAt(
      file,
      idArg.start,
      `The \`Route\` export ${problem}: its route id ${JSON.stringify(idArg.value)} is not updated to ${JSON.stringify(expected.routeId)}.`,
    ),
  ]
}

/** Whether the route's constructor is called without an import (the generator adds it). */
function isUnbound(call: Extract<RouteCall, { kind: 'ours' }>) {
  return call.specifier === null && call.property === null
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
  call: Extract<RouteCall, { kind: 'ours' }>,
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

  if (call.specifier) {
    const specifier = call.specifier as Node & {
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
  if (
    !isUnbound(call) ||
    call.constructor !== wanted ||
    file.rootScope.lookup(wanted) !== null
  ) {
    for (let n = 2; !nameFree(local); n++) {
      local = `${wanted}${n}`
    }
  }

  // The new import copies the quotes and semicolons of the file's first
  // import (placement: `headerInsertOffset`).
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
