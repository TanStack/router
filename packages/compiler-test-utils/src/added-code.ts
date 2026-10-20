/**
 * What a build ships that a paired control build of the same app does not
 * (SPEC G7, J3.7): the oracle of dev-only support in production artifacts.
 * The control differs in one setting only (e.g. route HMR off), so code the
 * build has and the control lacks is attributed to that setting, whatever
 * it is named and wherever the bundler puts it.
 *
 * `addedCode(build, control)` compares the statements of every chunk of the
 * two builds, as multisets of their shapes:
 * - each statement at any depth, shallow (the statements nested in it are
 *   compared on their own), so one statement added inside a function shows
 *   as that statement only;
 * - alpha-equivalent: names the chunk binds (private helpers, minified
 *   names) are renamed in their order of appearance within the statement;
 *   free names (globals such as `console`) and property names stay;
 * - printer-independent: the syntax tree is compared, not the text (quotes,
 *   parentheses, layout);
 * - placement-independent: the chunks of a build form one multiset, and
 *   string literals naming emitted chunk files (content hashes) are one
 *   placeholder.
 * A harmless private renaming or printing difference therefore adds
 * nothing, while a development-only call made of names the bundle already
 * has (e.g. one more `console.warn(...)`) is an added statement.
 */
import path from 'node:path'
import { parseSync } from 'vite'
import { unboundNames } from './validate-module'

/** A statement a build ships that its control does not. */
export interface AddedStatement {
  /** The chunk of the build that holds it. */
  chunk: string
  /** Its code, as the build emitted it (at most 300 characters). */
  code: string
}

interface BuildChunks {
  chunks: ReadonlyArray<{ fileName: string; code: string }>
}

type Node = { type: string; start: number; end: number } & Record<
  string,
  unknown
>

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/**
 * Whether a node is a statement (or a declaration in statement position).
 * Import and export declarations are not: they link chunks (placement); the
 * declaration an export holds is compared on its own.
 */
function isStatement(node: Node) {
  return (
    (node.type.endsWith('Statement') && node.type !== 'BlockStatement') ||
    node.type === 'VariableDeclaration' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration'
  )
}

/** Import and export declarations (see `isStatement`). */
const linkingDeclarations = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
])

/** Keys of a node whose identifier is a property name, not a binding. */
function propertyKey(parent: Node, key: string) {
  return (
    (key === 'property' &&
      parent.type === 'MemberExpression' &&
      !parent.computed) ||
    (key === 'key' &&
      (parent.type === 'Property' ||
        parent.type === 'MethodDefinition' ||
        parent.type === 'PropertyDefinition' ||
        parent.type === 'AccessorProperty') &&
      !parent.computed) ||
    ((key === 'imported' || key === 'exported') &&
      parent.type.endsWith('Specifier')) ||
    (key === 'meta' && parent.type === 'MetaProperty') ||
    (key === 'property' && parent.type === 'MetaProperty') ||
    (key === 'label' &&
      (parent.type === 'LabeledStatement' ||
        parent.type === 'BreakStatement' ||
        parent.type === 'ContinueStatement'))
  )
}

// `shorthand`: `{ id }` and `{ id: id }` are the same object.
const ignoredKeys = new Set([
  'start',
  'end',
  'range',
  'loc',
  'raw',
  'type',
  'shorthand',
])

/** The statement shapes of a build, with a sample of each shape's code. */
function statementShapes(build: BuildChunks) {
  /** Strings that name an emitted file, or a hash part of its name. */
  const chunkNames = new Set<string>()
  for (const { fileName } of build.chunks) {
    chunkNames.add(fileName)
    chunkNames.add(path.basename(fileName))
    for (const part of path.basename(fileName).split(/[.\-_]/)) {
      if (part.length >= 6) {
        chunkNames.add(part)
      }
    }
  }
  const namesChunk = (value: string) =>
    chunkNames.has(value) ||
    [...chunkNames].some((name) => name.includes('.') && value.includes(name))

  const shapes = new Map<string, Array<AddedStatement>>()
  for (const chunk of build.chunks) {
    const free = unboundNames(chunk.code)
    const { program } = parseSync('chunk.js', chunk.code, {
      sourceType: 'module',
    })

    /** The shape of `statement`, its nested statements left out. */
    const shapeOf = (statement: Node) => {
      const renamed = new Map<string, string>()
      const shape = (value: unknown, parent?: Node, key?: string): unknown => {
        if (Array.isArray(value)) {
          return value.map((item) => shape(item, parent, key))
        }
        if (typeof value === 'bigint') {
          return `${value}n`
        }
        if (!isNode(value)) {
          return value
        }
        if (value.type === 'ParenthesizedExpression') {
          return shape(value.expression, parent, key)
        }
        if (
          value !== statement &&
          (isStatement(value) || value.type === 'BlockStatement')
        ) {
          return value.type === 'BlockStatement' ? '{…}' : '…'
        }
        if (value.type === 'Identifier' || value.type === 'PrivateIdentifier') {
          const name = value.name as string
          if (
            value.type === 'PrivateIdentifier' ||
            (parent && key && propertyKey(parent, key)) ||
            free.has(name)
          ) {
            return name
          }
          let alias = renamed.get(name)
          if (alias === undefined) {
            alias = `$${renamed.size}`
            renamed.set(name, alias)
          }
          return alias
        }
        if (value.type === 'Literal' && typeof value.value === 'string') {
          return namesChunk(value.value) ? '<chunk>' : value.value
        }
        const result: Record<string, unknown> = { t: value.type }
        for (const [childKey, child] of Object.entries(value)) {
          if (!ignoredKeys.has(childKey)) {
            result[childKey] = shape(child, value, childKey)
          }
        }
        return result
      }
      return JSON.stringify(shape(statement))
    }

    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      if (!isNode(value)) {
        return
      }
      if (linkingDeclarations.has(value.type)) {
        visit(value.declaration)
        return
      }
      if (isStatement(value)) {
        const key = shapeOf(value)
        let samples = shapes.get(key)
        if (!samples) {
          samples = []
          shapes.set(key, samples)
        }
        samples.push({
          chunk: chunk.fileName,
          code: chunk.code.slice(value.start, value.end).slice(0, 300),
        })
      }
      for (const [key, child] of Object.entries(value)) {
        if (!ignoredKeys.has(key)) {
          visit(child)
        }
      }
    }
    visit(program)
  }
  return shapes
}

/**
 * The statements `build` ships that `control` does not (see the header):
 * for each statement shape, as many of the build's samples as it has more
 * occurrences than the control.
 */
export function addedCode(
  build: BuildChunks,
  control: BuildChunks,
): Array<AddedStatement> {
  // The same chunks add nothing (and need no parsing).
  const codes = (chunks: BuildChunks) =>
    chunks.chunks.map((chunk) => chunk.code).sort()
  const buildCodes = codes(build)
  const controlCodes = codes(control)
  if (
    buildCodes.length === controlCodes.length &&
    buildCodes.every((code, index) => code === controlCodes[index])
  ) {
    return []
  }
  const controlShapes = statementShapes(control)
  const added: Array<AddedStatement> = []
  for (const [key, samples] of statementShapes(build)) {
    const extra = samples.length - (controlShapes.get(key)?.length ?? 0)
    if (extra > 0) {
      added.push(...samples.slice(samples.length - extra))
    }
  }
  return added
}
