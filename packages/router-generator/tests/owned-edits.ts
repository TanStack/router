/**
 * Shared test helper: what the generator may change in a route file it
 * keeps up (SPEC J1.1, J1.2).
 *
 * The generator owns the route id argument of the `Route` constructor call,
 * the constructor's callee (`createFileRoute` / `createLazyFileRoute`) and
 * the imports from the router package (to add, move or drop the
 * constructor's binding). Everything else is the user's and keeps its exact
 * bytes: other statements, other imports, comments, formatting and line
 * endings. Inside the router package imports, the other bindings keep their
 * imported name, local name and type/value meaning; an import of the
 * constructor under its own name may stay or go (the edit may have made it
 * unused, J1.2), an aliased one is the user's. The quote character and
 * printing of the edited argument and of an edited import are free.
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

/**
 * `code` with the spans the generator owns replaced by markers, and without
 * the lines that held nothing but router package imports.
 */
function unownedText(code: string, fileName: string) {
  const { program } = parseSync(fileName, code)
  const spans: Array<[number, number, string]> = []
  for (const statement of program.body as Array<Node>) {
    if (
      statement.type === 'ImportDeclaration' &&
      routerPackages.test(statement.source.value)
    ) {
      spans.push([statement.start, statement.end, 'import'])
    }
  }
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
    .filter((line) => !(line.includes(owned) && line.replaceAll(owned, '').trim() === ''))
    .join('')
}

/**
 * The bindings of a module's router package imports other than the route
 * constructors: `<imported> as <local>` (`* as <local>` for a namespace),
 * with `type ` in front of type-only ones.
 */
function routerBindings(code: string, fileName: string) {
  const { program } = parseSync(fileName, code)
  const bindings: Array<string> = []
  for (const statement of program.body as Array<Node>) {
    if (
      statement.type !== 'ImportDeclaration' ||
      !routerPackages.test(statement.source.value)
    ) {
      continue
    }
    for (const specifier of statement.specifiers as Array<Node>) {
      const type =
        statement.importKind === 'type' || specifier.importKind === 'type'
          ? 'type '
          : ''
      if (specifier.type === 'ImportNamespaceSpecifier') {
        bindings.push(`${type}* as ${specifier.local.name}`)
      } else if (specifier.type === 'ImportDefaultSpecifier') {
        bindings.push(`${type}default as ${specifier.local.name}`)
      } else {
        const imported =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value
        // (an aliased constructor import is the user's: other code may use it)
        if (
          !type &&
          constructors.has(imported) &&
          specifier.local.name === imported
        ) {
          continue
        }
        bindings.push(`${type}${imported} as ${specifier.local.name}`)
      }
    }
  }
  return bindings.sort()
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
  expect(unownedText(after, fileName), 'the code the generator does not own').toBe(
    unownedText(before, fileName),
  )
  expect(
    routerBindings(after, fileName),
    'the other bindings of the router package imports',
  ).toEqual(routerBindings(before, fileName))
}
