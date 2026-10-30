/**
 * Source-map assertions through a standard consumer (SPEC G6, §5.14): maps
 * are read with `@jridgewell/trace-mapping`, never a hand decoder, and
 * tests locate code by parsed tokens or executed throws, never by printed
 * syntax. Only "this generated position resolves to the user's
 * file, line (and column)" and "the map holds the user's file as written"
 * (its `sourcesContent`, what a debugger shows) are asserted: map layout,
 * `names`, granularity and mappings of generated support code are free.
 *
 * Positions follow the source-map convention: `line` 1-based, `column`
 * 0-based. Lines are counted with every JavaScript line terminator (`\n`,
 * `\r\n`, a lone `\r`, U+2028, U+2029), so CRLF sources work.
 *
 * API:
 * - `inlineSourceMap(code)`: the map of a `//# sourceMappingURL=data:`
 *   comment (what dev servers serve), or `undefined`.
 * - `positionAt(code, offset)`.
 * - `findNodes(code, predicate, options?)` and `tokenOffsets(code, query,
 *   options?)`: offsets of parsed syntax (identifiers, string values, a
 *   `throw`), whatever the printing.
 * - `originalPositionOf(map, generated)`: the original `{ source, line,
 *   column }` of a generated position, or `undefined` when unmapped.
 * - `traceStack(stack, mapOf)`: the frames of an executed throw's stack,
 *   each resolved through the map `mapOf` gives for its file.
 * - `expectMapsTo(map, generated, expected)`: asserts a generated position
 *   resolves to `expected.file` (any spelling `mentionsFile` accepts, a
 *   relative source resolved against `expected.mapUrl`, the module the map
 *   belongs to), `expected.line` and, when given, `expected.column` and
 *   the file's text `expected.text`.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  TraceMap,
  originalPositionFor,
  sourceContentFor,
} from '@jridgewell/trace-mapping'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { mentionsFile } from './diagnostics'
import type { SourceMapInput } from '@jridgewell/trace-mapping'

export type { SourceMapInput } from '@jridgewell/trace-mapping'

/** A position in a module: `line` 1-based, `column` 0-based. */
export interface Position {
  line: number
  column: number
}

/** An original position a map points at. */
export interface OriginalPosition extends Position {
  /** The source as the map names it (resolved against `sourceRoot`). */
  source: string
}

/** A map, in any form trace-mapping reads, or a map it already read. */
export type AnySourceMap = SourceMapInput | TraceMap | LooseSourceMap

/**
 * A version 3 map as tools type it (Vite, Babel, the build harness: a
 * `number` version, possibly `null` sources).
 */
export interface LooseSourceMap {
  version: number
  mappings: string
  sources: ReadonlyArray<string | null>
  names?: ReadonlyArray<string>
  sourceRoot?: string
  sourcesContent?: ReadonlyArray<string | null>
  file?: string | null
}

function traceMap(map: AnySourceMap) {
  return map instanceof TraceMap ? map : new TraceMap(map as SourceMapInput)
}

/**
 * The source map of a `//# sourceMappingURL=data:…` comment in `code`, or
 * `undefined` when there is none (an external map is fetched by the test).
 */
export function inlineSourceMap(code: string): SourceMapInput | undefined {
  const comments = [
    ...code.matchAll(
      /[#@] sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?(;base64)?,([^\s*'"]+)/g,
    ),
  ]
  const last = comments.at(-1)
  if (!last) {
    return undefined
  }
  const json = last[1]
    ? Buffer.from(last[2]!, 'base64').toString('utf8')
    : decodeURIComponent(last[2]!)
  return JSON.parse(json) as SourceMapInput
}

const lineTerminators = /\r\n|[\n\r\u2028\u2029]/g

/** The position of `offset` in `code`. */
export function positionAt(code: string, offset: number): Position {
  let line = 1
  let lineStart = 0
  for (const match of code.slice(0, offset).matchAll(lineTerminators)) {
    line++
    lineStart = match.index + match[0].length
  }
  return { line, column: offset - lineStart }
}

/** A parsed syntax node (ESTree, with offsets). */
export interface SyntaxNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SyntaxNode).type === 'string' &&
    typeof (value as SyntaxNode).start === 'number'
  )
}

/**
 * The nodes of `code` (parsed as `filename`, default `module.tsx`) that
 * `predicate` accepts, in source order.
 */
export function findNodes(
  code: string,
  predicate: (node: SyntaxNode) => boolean,
  options: { filename?: string } = {},
): Array<SyntaxNode> {
  const { program, errors } = parseSync(
    options.filename ?? 'module.tsx',
    code,
    { sourceType: 'module' },
  )
  if (errors.length > 0) {
    throw new Error(
      `cannot parse the code: ${errors.map((error) => error.message).join('; ')}`,
    )
  }
  const found: Array<SyntaxNode> = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object' || value === null) {
      return
    }
    if (isNode(value) && predicate(value)) {
      found.push(value)
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'parent') {
        visit(child)
      }
    }
  }
  visit(program)
  return found.sort((a, b) => a.start - b.start)
}

/** What `tokenOffsets` looks for. */
export type TokenQuery =
  /** An identifier (binding, reference, property or JSX name). */
  | { identifier: string }
  /** A string literal or a template part with this value, any quotes. */
  | { string: string }
  /** A `throw` statement. */
  | { throw: true }

/** Start offsets of the tokens of `code` matching `query`. */
export function tokenOffsets(
  code: string,
  query: TokenQuery,
  options: { filename?: string } = {},
): Array<number> {
  const matches = (node: SyntaxNode) => {
    if ('identifier' in query) {
      return (
        /Identifier$/.test(node.type) &&
        (node.name === query.identifier ||
          (node.type === 'PrivateIdentifier' &&
            `#${String(node.name)}` === query.identifier))
      )
    }
    if ('string' in query) {
      return (
        (node.type === 'Literal' && node.value === query.string) ||
        (node.type === 'JSXText' && node.value === query.string) ||
        (node.type === 'TemplateElement' &&
          (node.value as { cooked?: string } | undefined)?.cooked ===
            query.string)
      )
    }
    return node.type === 'ThrowStatement'
  }
  return findNodes(code, matches, options).map((node) => node.start)
}

/**
 * The original position a generated position maps to, or `undefined` when
 * the map has no mapping for it.
 */
export function originalPositionOf(
  map: AnySourceMap,
  generated: Position,
): OriginalPosition | undefined {
  const original = originalPositionFor(traceMap(map), generated)
  if (original.source === null) {
    return undefined
  }
  return {
    source: original.source,
    line: original.line,
    column: original.column,
  }
}

/** A frame of a stack trace, resolved through its file's map. */
export interface TracedFrame {
  /** The file (path or URL) the frame names. */
  location: string
  /** The frame's generated position. */
  generated: Position
  /** Where the map of `location` resolves it, when it has one. */
  original?: OriginalPosition
}

/**
 * The frames of `stack` (V8, SpiderMonkey and JavaScriptCore formats),
 * each resolved through the map `mapOf(location)` returns for its file
 * (`undefined`: no map, the frame stays unresolved).
 */
export function traceStack(
  stack: string,
  mapOf: (location: string) => AnySourceMap | undefined,
): Array<TracedFrame> {
  const frames: Array<TracedFrame> = []
  const maps = new Map<string, TraceMap | undefined>()
  for (const line of stack.split('\n')) {
    const frame =
      /((?:[a-z][\w+.-]*:\/\/?)?[^\s()@]+?):(\d+):(\d+)\)?\s*$/.exec(line)
    if (!frame) {
      continue
    }
    const location = frame[1]!
    if (!maps.has(location)) {
      const map = mapOf(location)
      maps.set(location, map === undefined ? undefined : traceMap(map))
    }
    // Stack columns are 1-based.
    const generated = { line: Number(frame[2]), column: Number(frame[3]) - 1 }
    const map = maps.get(location)
    const original = map ? originalPositionOf(map, generated) : undefined
    frames.push({ location, generated, ...(original && { original }) })
  }
  return frames
}

/** What `expectMapsTo` requires of an original position. */
export interface ExpectedOriginal {
  /**
   * The user's file, absolute or relative to `root`, named as
   * `mentionsFile` accepts (SPEC §5.7).
   */
  file: string
  root?: string
  /**
   * Where the map belongs: the URL (`file:`, `http:`) or absolute path of
   * the generated module it maps (with its query, if any). A relative
   * source is resolved against it first, as the source map specification
   * resolves sources (a dev server's `fail.ts` for its module
   * `/src/fail.ts`).
   */
  mapUrl?: string
  /** 1-based line. */
  line: number
  /** 0-based column; checked only when given. */
  column?: number
  /**
   * The file as written, which the map holds for the source
   * (`sourcesContent`: what a debugger shows); checked only when given.
   */
  text?: string
}

/** A URL scheme (`file:`, `webpack:`), not a Windows drive letter. */
const urlScheme = /^[A-Za-z][\w+.-]+:/

/**
 * `source` resolved against `mapUrl` (the URL or absolute path of the
 * module the map belongs to) when it is relative; as the map names it
 * otherwise.
 */
function resolvedSource(source: string, mapUrl: string | undefined) {
  const absolute =
    urlScheme.test(source) ||
    source.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(source)
  if (mapUrl === undefined || absolute) {
    return source
  }
  const resolved = new URL(
    source,
    urlScheme.test(mapUrl) ? mapUrl : pathToFileURL(mapUrl),
  )
  return resolved.protocol === 'file:' ? fileURLToPath(resolved) : resolved.href
}

/**
 * Asserts that `generated` resolves through `map` (of the module at
 * `expected.mapUrl`) to `expected`, and returns the original position.
 */
export function expectMapsTo(
  map: AnySourceMap,
  generated: Position,
  expected: ExpectedOriginal,
): OriginalPosition {
  const traced = traceMap(map)
  const original = originalPositionOf(traced, generated)
  const description = `generated ${generated.line}:${generated.column}`
  expect(original, `${description} has a mapping`).toBeDefined()
  const source = resolvedSource(original!.source, expected.mapUrl)
  expect(
    mentionsFile(source, expected.file, expected),
    `${description} maps to ${source}, expected ${expected.file}`,
  ).toBe(true)
  expect(
    expected.column === undefined
      ? { line: original!.line }
      : { line: original!.line, column: original!.column },
    description,
  ).toEqual(
    expected.column === undefined
      ? { line: expected.line }
      : { line: expected.line, column: expected.column },
  )
  if (expected.text !== undefined) {
    expect(
      sourceContentFor(traced, original!.source),
      `${description}: the text the map holds for ${source}`,
    ).toBe(expected.text)
  }
  return original!
}
