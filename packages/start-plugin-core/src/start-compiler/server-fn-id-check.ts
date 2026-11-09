/**
 * Which ids a custom `serverFns.generateFunctionId` may return. The client
 * puts the id after `TSS_SERVER_FN_BASE` unencoded and the server reads that
 * path segment back, so an id has to survive that trip whole.
 */

interface CustomIdSubject {
  /** The server function's variable name. */
  name: string
  /** The `functionName` the generator received. */
  functionName: string
  /** The defining file, relative to the root. */
  rootRel: string
}

/**
 * `error`: the id never reached its handler: a character that splits or
 * ends the path or that a client percent-encodes, a dot segment, which URL
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
