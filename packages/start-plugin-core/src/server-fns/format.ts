/**
 * Everything a build prints or hashes about server-fn ids and metadata,
 * in the formats earlier Start versions printed: tooling reads them from
 * the server bundle (the manifest's keys and `functionName`s, the
 * `createServerRpc` metadata, the client's and SSR's rpc ids), so they
 * stay until a major version changes them here, and only here
 * (FOLLOW-UPS "server-fn output formats"). The rest of the compiler keys
 * a server fn by its stable key (registry, placeholders, dev ids, wrapper
 * names), never by these.
 *
 * Fixes of what earlier versions got wrong act only on the inputs they got
 * wrong: names that are no identifier (shapes they refused), collisions
 * across files (ranked by file instead of compile order), ids that never
 * worked over HTTP (a build error).
 */
import { hash } from 'node:crypto'
import { stringLiteral } from '@tanstack/router-utils/compiler'

/** The default production id: sha256 hex of `<file>--<functionName>`. */
export function defaultFunctionId(fn: {
  /** Root-relative path of the defining file (forward slashes). */
  rootRel: string
  /** `handlerFunctionName`. */
  functionName: string
}): string {
  return hash('sha256', `${fn.rootRel}--${fn.functionName}`, 'hex')
}

/**
 * The `functionName` of a server fn: what a custom `generateFunctionId`
 * receives and the default id hashes, `<name>_createServerFn_handler`, then
 * `_1`, `_2`… for a name taken earlier in the module (`taken`: the module's
 * names so far, in source order; a numbered name drops characters outside
 * `[A-Za-z0-9_$]` and a leading or trailing `_`, as earlier versions did).
 * `base` is the variable or property name; one that is no identifier (a
 * string property key) has `_` for each character outside `[A-Za-z0-9_$]`.
 */
export function handlerFunctionName(base: string, taken: Set<string>): string {
  const stem = IDENTIFIER.test(base)
    ? base
    : base.replace(/[^A-Za-z0-9_$]/g, '_')
  let name = `${stem}_createServerFn_handler`
  while (taken.has(name)) {
    const [prefix, count] = name.split(/_(\d+)$/)
    name = `${identifierSafe(prefix!)}_${Number(count || '0') + 1}`
  }
  taken.add(name)
  return name
}

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u

function identifierSafe(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_$]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .replace(/^\$/, '_$')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * `serverFnMeta.name`: the name of the variable (or property) the server
 * fn is assigned to, also when it is exported under another name;
 * `default` for `export default`.
 */
export function metaName(site: { base: string }): string {
  return site.base
}

/**
 * A string literal of a compiled module: the `createServerRpc` metadata
 * (`id`, `name`, `filename`) and the `createClientRpc` / `createSsrRpc` id.
 * Double quotes, and `\xHH` / `\uHHHH` for every character outside
 * printable ASCII, as Babel's generator printed them.
 */
export function moduleLiteral(value: string): string {
  let out = '"'
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    const ch = value[i]!
    if (c >= 0x20 && c <= 0x7e && ch !== '"' && ch !== '\\') {
      out += ch
    } else if (ch === '"' || ch === '\\') {
      out += `\\${ch}`
    } else if (ch in SINGLE_ESCAPES) {
      out += SINGLE_ESCAPES[ch]
    } else if (c === 0 && !/[0-9]/.test(value[i + 1] ?? '')) {
      out += '\\0'
    } else if (c <= 0xff) {
      out += `\\x${c.toString(16).toUpperCase().padStart(2, '0')}`
    } else {
      out += `\\u${c.toString(16).toUpperCase().padStart(4, '0')}`
    }
  }
  return `${out}"`
}

const SINGLE_ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

/** A string literal of the resolver's manifest (an entry's key and `functionName`): single quotes. */
export function manifestLiteral(value: string): string {
  return stringLiteral(value, "'")
}

/**
 * The order collisions of custom ids are numbered in, within one rank
 * (client-referenced, then server-only): by file, then source order in
 * the file (`_1` goes to the later of two server fns of a file).
 */
export function collisionOrder(
  a: { rootRel: string; ordinal: number },
  b: { rootRel: string; ordinal: number },
): number {
  return (
    (a.rootRel < b.rootRel ? -1 : a.rootRel > b.rootRel ? 1 : 0) ||
    a.ordinal - b.ordinal
  )
}

/**
 * Whether a custom id works as one path segment of its URL
 * (`TSS_SERVER_FN_BASE + id`, unencoded; the server reads the segment back).
 * `error`: it never reached its handler: a character that splits or ends
 * the path or that a client percent-encodes, a dot segment, which URL
 * parsing removes, or a percent-encoding the server decodes to another id
 * or rejects (`readBack`). `deprecated`: an ASCII character outside RFC
 * 3986's unreserved set and `$`, which reaches the server but which proxies
 * and servers may encode or normalise.
 */
export function customIdCheck(id: string): 'ok' | 'deprecated' | 'error' {
  if (
    id === '.' ||
    id === '..' ||
    /[^\x21-\x7e]|["#/<>?\\^`{}]/.test(id) ||
    (id.includes('%') && readBack(id) !== id)
  ) {
    return 'error'
  }
  return /^[A-Za-z0-9\-._~$]+$/.test(id) ? 'ok' : 'deprecated'
}

/**
 * The id the server reads from the URL of an id holding `%`: the request
 * URL's path, decoded as Start's server does when the path holds `%`
 * (router-core `getNormalizedURL`, `decodePath`: `decodeURI` keeping `%25`
 * and `%5C`, then control characters and `"<>\`{}` encoded again) and
 * parsed again; `undefined` when the decode throws (the server answers 400).
 */
function readBack(id: string): string | undefined {
  const base = '/_/'
  const { pathname } = new URL(base + id, 'http://localhost')
  let decoded = ''
  try {
    for (const part of pathname.split(/(%25|%5C)/i)) {
      decoded += /^%(25|5C)$/i.test(part)
        ? part
        : decodeURI(part).replace(
            // eslint-disable-next-line no-control-regex
            /[\x00-\x1f\x7f"<>`{}]/g,
            (ch) =>
              `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
          )
    }
  } catch {
    return undefined
  }
  const read = new URL(decoded, 'http://localhost').pathname
  return read.startsWith(base)
    ? read.slice(base.length).split('/')[0]
    : undefined
}

/** The build error of a custom id `customIdCheck` refuses. */
export function customIdError(fn: CustomIdSubject, id: string): string {
  return `[tanstack-start] serverFns.generateFunctionId returned ${JSON.stringify(id)} for the server function ${fn.name} (functionName "${fn.functionName}") of ${fn.rootRel}. A server function id is one path segment of its URL: it cannot hold whitespace, control or non-ASCII characters or any of " # / < > ? \\ ^ \` { }, cannot be "." or "..", and cannot hold a percent-encoding the server reads as another id ("%41") or rejects. Use ASCII letters, digits, "-", ".", "_", "~" and "$".`
}

/** The build warning of a custom id `customIdCheck` deprecates. */
export function customIdWarning(fn: CustomIdSubject, id: string): string {
  return `[tanstack-start] serverFns.generateFunctionId returned ${JSON.stringify(id)} for the server function ${fn.name} (functionName "${fn.functionName}") of ${fn.rootRel}. Server function ids with characters other than ASCII letters, digits, "-", ".", "_", "~" and "$" are deprecated, and the next major version of TanStack Start rejects them: proxies and servers may encode or normalise them in the URL.`
}

interface CustomIdSubject {
  name: string
  functionName: string
  rootRel: string
}
