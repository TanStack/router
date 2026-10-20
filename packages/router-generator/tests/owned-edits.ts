/**
 * Shared test helper: what the generator may change in a route file it
 * keeps up (SPEC J1.1, J1.2).
 *
 * The generator owns the route id argument of the `Route` constructor call,
 * the constructor's callee (`createFileRoute` / `createLazyFileRoute`) and
 * the router package import statements that bind a route constructor (to
 * add, move or drop the constructor's binding). When the file does not
 * import the constructor its callee now names, the generator may also add
 * that binding to one other router package import (or write a new import).
 * Everything else is the user's and keeps its exact bytes: other
 * statements, the other imports (other router package imports included),
 * comments, formatting and line endings. Inside the edited imports, the
 * other bindings keep their imported name, local name, source package and
 * type/value meaning; an import of the constructor under its own name may
 * stay or go (the edit may have made it unused, J1.2), an aliased one is the
 * user's. The quote character and printing of the edited argument and of an
 * edited import are free, and so is where an import sits among the imports
 * (§5.5).
 *
 * `expectOnlyOwnedEdits(before, after)` asserts exactly that; the caller
 * checks the outcome of the edit itself (`routeCallOf`: the constructor and
 * the id the file now has).
 */
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { routeCallSpansOf } from './route-id'

/** The router packages route files import their constructors from. */
const routerPackages = /^@tanstack\/(?:react|solid|vue)-router$/

/** The route constructors the generator may add, switch or drop. */
const constructors = new Set(['createFileRoute', 'createLazyFileRoute'])

type Node = Record<string, any>

/** A marker that occurs in no source. */
const owned = '\u0000'

/** A router package import statement of a module. */
interface RouterImport {
  start: number
  end: number
  /** The statement's exact source text. */
  text: string
  /** Whether it binds a route constructor (under any local name). */
  bindsConstructor: boolean
  /** The local names it binds. */
  locals: Array<string>
  /**
   * Its bindings other than value imports of a route constructor under its
   * own name: `<imported> as <local> from <package>` (`* as <local>` for a
   * namespace), with `type ` in front of type-only ones.
   */
  bindings: Array<string>
}

function routerImportsOf(code: string, fileName: string) {
  const { program } = parseSync(fileName, code)
  const imports: Array<RouterImport> = []
  for (const statement of program.body as Array<Node>) {
    if (
      statement.type !== 'ImportDeclaration' ||
      !routerPackages.test(statement.source.value)
    ) {
      continue
    }
    const source = statement.source.value as string
    const entry: RouterImport = {
      start: statement.start,
      end: statement.end,
      text: code.slice(statement.start, statement.end),
      bindsConstructor: false,
      locals: [],
      bindings: [],
    }
    for (const specifier of statement.specifiers as Array<Node>) {
      const type =
        statement.importKind === 'type' || specifier.importKind === 'type'
          ? 'type '
          : ''
      const local = specifier.local.name as string
      entry.locals.push(local)
      if (specifier.type === 'ImportNamespaceSpecifier') {
        entry.bindings.push(`${type}* as ${local} from ${source}`)
      } else if (specifier.type === 'ImportDefaultSpecifier') {
        entry.bindings.push(`${type}default as ${local} from ${source}`)
      } else {
        const imported =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value
        if (constructors.has(imported)) {
          entry.bindsConstructor = true
          // (an aliased constructor import is the user's: other code may use it)
          if (!type && local === imported) {
            continue
          }
        }
        entry.bindings.push(`${type}${imported} as ${local} from ${source}`)
      }
    }
    imports.push(entry)
  }
  return imports
}

/**
 * `code` with the spans the generator owns replaced by markers, and without
 * the lines that held nothing but router package imports (where an import
 * sits is free; the router package imports are compared separately).
 */
function unownedText(code: string, fileName: string) {
  const spans: Array<[number, number, string]> = routerImportsOf(
    code,
    fileName,
  ).map((statement) => [statement.start, statement.end, 'import'])
  const call = routeCallSpansOf(code, fileName)
  spans.push([...call.callee, 'constructor'])
  if (call.id) {
    spans.push([...call.id, 'id'])
  }
  spans.sort((a, b) => a[0] - b[0])
  let text = ''
  let last = 0
  for (const [start, end, kind] of spans) {
    text += code.slice(last, start) + owned + (kind === 'import' ? '' : kind)
    last = end
  }
  text += code.slice(last)
  return text
    .split(/(?<=\n)/)
    .filter(
      (line) =>
        !(line.includes(owned) && line.replaceAll(owned, '').trim() === ''),
    )
    .join('')
}

/** `from` without one statement of the same exact text per statement of `other`. */
function withoutStatementsOf(
  from: Array<RouterImport>,
  other: Array<RouterImport>,
) {
  const remaining = other.map((statement) => statement.text)
  return from.filter((statement) => {
    const index = remaining.indexOf(statement.text)
    if (index === -1) {
      return true
    }
    remaining.splice(index, 1)
    return false
  })
}

/** The identifier a callee (`createFileRoute`, `Router.createFileRoute`) starts with. */
function rootIdentifierOf(callee: string) {
  return /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/u.exec(callee)?.[0]
}

/**
 * Asserts that `after` (a route file as the generator left it) differs from
 * `before` only where the generator may edit it: see the module comment.
 */
export function expectOnlyOwnedEdits(
  before: string,
  after: string,
  fileName = 'route.tsx',
) {
  expect(
    unownedText(after, fileName),
    'the code the generator does not own',
  ).toBe(unownedText(before, fileName))

  const importsBefore = routerImportsOf(before, fileName)
  const importsAfter = routerImportsOf(after, fileName)
  // the router package imports the generator rewrote or dropped, and the
  // ones it rewrote them into or added
  const edited = withoutStatementsOf(importsBefore, importsAfter)
  const written = withoutStatementsOf(importsAfter, importsBefore)

  const [calleeStart, calleeEnd] = routeCallSpansOf(after, fileName).callee
  const calleeRoot = rootIdentifierOf(after.slice(calleeStart, calleeEnd))
  const constructorWasImported = importsBefore.some(
    (statement) => calleeRoot && statement.locals.includes(calleeRoot),
  )
  const editedWithoutConstructor = edited
    .filter((statement) => !statement.bindsConstructor)
    .map((statement) => statement.text)
  if (constructorWasImported) {
    expect(
      editedWithoutConstructor,
      'the router package imports binding no route constructor (the file already imported the one it uses)',
    ).toEqual([])
  } else {
    expect(
      editedWithoutConstructor.length,
      'the router package imports binding no route constructor (only one may take the missing constructor)',
    ).toBeLessThanOrEqual(1)
  }
  expect(
    written.flatMap((statement) => statement.bindings).sort(),
    'the other bindings of the edited router package imports',
  ).toEqual(edited.flatMap((statement) => statement.bindings).sort())
}
