/**
 * Shared test helper: what the generator may change in a route file it
 * keeps up (SPEC J1.1, J1.2).
 *
 * The generator owns the route id argument of the `Route` constructor call
 * and the constructor's callee (`createFileRoute` / `createLazyFileRoute`),
 * and it may add, move or drop the constructor's binding. How it does that
 * to the import statements is free (SPEC J1.2): it may write a new import
 * or edit, merge, split, reorder or reprint any import statement. What the
 * imports bind is the user's: every binding keeps its imported name, local
 * name, source module, type/value meaning and import attributes, and every
 * side-effect import stays. A value import of a route constructor under its
 * own name from a router package may stay or go (the edit may have made it
 * unused, J1.2); an aliased one, or one from another module, is the user's.
 * Everything outside the import statements keeps its exact bytes: other
 * statements, comments, formatting and line endings. The quote character and
 * printing of the edited argument are free.
 *
 * `expectOnlyOwnedEdits(before, after)` asserts exactly that; the caller
 * checks the outcome of the edit itself (`routeCallOf`: the constructor and
 * the id the file now has) and that the file still evaluates.
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

function importsOf(code: string, fileName: string) {
  const { program } = parseSync(fileName, code)
  return (program.body as Array<Node>).filter(
    (statement) => statement.type === 'ImportDeclaration',
  )
}

function nameOf(node: Node) {
  return (node.type === 'Identifier' ? node.name : node.value) as string
}

/**
 * What the import statements of `code` bind, one entry per binding
 * (`<imported> as <local> from <source>`, `* as <local>` for a namespace,
 * `type ` in front of type-only ones) and per side-effect import
 * (`import <source>`), each with the statement's import attributes; without
 * value imports of a route constructor under its own name from a router
 * package. Sorted, without duplicates.
 */
function bindingsOf(code: string, fileName: string) {
  const bindings = new Set<string>()
  for (const statement of importsOf(code, fileName)) {
    const source = statement.source.value as string
    const attributes = ((statement.attributes ?? []) as Array<Node>)
      .map((attribute) => `${nameOf(attribute.key)}: ${attribute.value.value}`)
      .sort()
    const from = `${source}${attributes.length ? ` with { ${attributes.join(', ')} }` : ''}`
    const specifiers = statement.specifiers as Array<Node>
    if (specifiers.length === 0) {
      bindings.add(`import ${from}`)
    }
    for (const specifier of specifiers) {
      const type =
        statement.importKind === 'type' || specifier.importKind === 'type'
          ? 'type '
          : ''
      const local = specifier.local.name as string
      if (specifier.type === 'ImportNamespaceSpecifier') {
        bindings.add(`${type}* as ${local} from ${from}`)
      } else if (specifier.type === 'ImportDefaultSpecifier') {
        bindings.add(`${type}default as ${local} from ${from}`)
      } else {
        const imported = nameOf(specifier.imported)
        if (
          !type &&
          local === imported &&
          constructors.has(imported) &&
          routerPackages.test(source)
        ) {
          continue
        }
        bindings.add(`${type}${imported} as ${local} from ${from}`)
      }
    }
  }
  return [...bindings].sort()
}

/**
 * `code` with the spans the generator owns replaced by markers, and without
 * the lines that held nothing but import statements (the import statements
 * are compared by what they bind). Blank lines next to those lines, or at
 * the start of the file, go too: a generator that deletes exactly an import
 * statement leaves its line break and the blanks around it (J1.2 pins the
 * bytes outside the import statements, not the blank lines between them).
 */
function unownedText(code: string, fileName: string) {
  const spans: Array<[number, number, string]> = importsOf(code, fileName).map(
    (statement) => [statement.start, statement.end, 'import'],
  )
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
  const lines = text.split(/(?<=\n|\r(?!\n))/)
  const blank = (line: string) => line.replaceAll(owned, '').trim() === ''
  let kept = ''
  for (let index = 0; index < lines.length; ) {
    if (!blank(lines[index]!)) {
      kept += lines[index++]
      continue
    }
    // A run of blank lines and lines holding import statements only
    const start = index
    while (index < lines.length && blank(lines[index]!)) {
      index++
    }
    const run = lines.slice(start, index)
    if (start > 0 && !run.some((line) => line.includes(owned))) {
      kept += run.join('')
    }
  }
  return kept
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
    'the code outside the import statements the generator does not own',
  ).toBe(unownedText(before, fileName))
  expect(
    bindingsOf(after, fileName),
    'what the import statements bind (other than the route constructor)',
  ).toEqual(bindingsOf(before, fileName))
}
