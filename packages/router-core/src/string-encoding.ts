/**
 * Central module for URL-path string encoding and decoding. It is the only
 * place in `src/` allowed to use `encodeURIComponent`/`decodeURI*` directly
 * (enforced by ESLint) — see ./docs/string-handling.md for the full
 * trust-boundary documentation.
 *
 * Malformed percent-encoding policy: param decoding throws `URIError`
 * (`decodeParam`) and `findMatch` converts that into "no match".
 */
declare const encodedPathParamBrand: unique symbol
export type EncodedPathParam = string & {
  readonly [encodedPathParamBrand]: true
}

declare const decodedPathParamBrand: unique symbol
export type DecodedPathParam = string & {
  readonly [decodedPathParamBrand]: true
}

/** A full URL path whose parameters have been encoded (interpolatePath output). */
declare const encodedPathBrand: unique symbol
export type EncodedPath = string & { readonly [encodedPathBrand]: true }

/** A full URL path that has been decoded (decodePath output; location.pathname). */
declare const decodedPathBrand: unique symbol
export type DecodedPath = string & { readonly [decodedPathBrand]: true }

/**
 * Decode a path-parameter value extracted from a URL pathname.
 * Throws `URIError` on malformed percent-encoding (`%zz`, truncated `%E4%BD`);
 * `findMatch` is the single choke point that turns that into "no match".
 */
export function decodeParam(value: string): DecodedPathParam {
  return decodeURIComponent(value) as DecodedPathParam
}

// Must stay percent-encoded: control chars + WHATWG path-encode set subset
// (", <, >, `, {, }). Space excluded on purpose — see docs/string-handling.md.
// eslint-disable-next-line no-control-regex
const PATH_UNSAFE_RE = /[\x00-\x1f\x7f"<>`{}]/g

function sanitizePathSegment(segment: string): string {
  return segment.replace(
    PATH_UNSAFE_RE,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  )
}

function decodeSegment(segment: string): string {
  let decoded: string
  try {
    decoded = decodeURI(segment)
  } catch {
    // if the decoding fails, try to decode the various parts leaving the malformed tags in place
    decoded = segment.replaceAll(/%[0-9A-F]{2}/gi, (match) => {
      try {
        return decodeURI(match)
      } catch {
        return match
      }
    })
  }
  return sanitizePathSegment(decoded)
}

export function decodePath(path: string): {
  path: DecodedPath
  handledProtocolRelativeURL: boolean
} {
  if (!path)
    return { path: path as DecodedPath, handledProtocolRelativeURL: false }

  // Fast path: most paths are already decoded and safe.
  // Only fall back to the slower scan/regex path when we see a '%' (encoded),
  // a backslash (explicitly handled), a control character, or a protocol-relative
  // prefix which needs collapsing.
  // eslint-disable-next-line no-control-regex
  if (!/[%\\\x00-\x1f\x7f]/.test(path) && !path.startsWith('//')) {
    return { path: path as DecodedPath, handledProtocolRelativeURL: false }
  }

  const re = /%25|%5C/gi
  let cursor = 0
  let result = ''
  let match
  while (null !== (match = re.exec(path))) {
    result += decodeSegment(path.slice(cursor, match.index)) + match[0]
    cursor = re.lastIndex
  }
  result = result + decodeSegment(cursor ? path.slice(cursor) : path)

  // Prevent open redirect via protocol-relative URLs (e.g. "//evil.com")
  // This is defense-in-depth: since control characters are no longer decoded,
  // paths like "/%0d/evil.com" can no longer become "//evil.com". But we keep
  // this check to guard against other edge cases.
  let handledProtocolRelativeURL = false
  if (result.startsWith('//')) {
    handledProtocolRelativeURL = true
    result = '/' + result.replace(/^\/+/, '')
  }

  return { path: result as DecodedPath, handledProtocolRelativeURL }
}

/**
 * Encodes whitespace and non-ASCII like `new URL()` would, without URL parsing;
 * preserves existing `%XX` sequences and ASCII specials. Used for SSR hrefs.
 * Output is not fully encoded (`#` passes through), hence no brand.
 */
export function encodePathLikeUrl(path: string): string {
  // Encode whitespace and non-ASCII characters that browsers encode in URLs

  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check
  // eslint-disable-next-line no-control-regex
  if (!/\s|[^\u0000-\u007F]/.test(path)) return path
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check
  // eslint-disable-next-line no-control-regex
  return path.replace(/\s|[^\u0000-\u007F]/gu, encodeURIComponent)
}

/** URL for the dev-only route-scoped CSS endpoint, used by HeadContent. */
export function buildDevStylesUrl(
  basepath: string,
  routeIds: Array<string>,
): string {
  // Trim all leading and trailing slashes from basepath
  const trimmedBasepath = basepath.replace(/^\/+|\/+$/g, '')
  // Build normalized basepath: empty string for root, or '/path' for non-root
  const normalizedBasepath = trimmedBasepath === '' ? '' : `/${trimmedBasepath}`
  return `${normalizedBasepath}/@tanstack-start/styles.css?routes=${encodeURIComponent(routeIds.join(','))}`
}

// Based on https://github.com/zertosh/htmlescape (MIT)
const HTML_ESCAPE_LOOKUP: { [match: string]: string } = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const HTML_ESCAPE_REGEX = /[&><\u2028\u2029]/g

/**
 * Escape HTML special characters to prevent XSS when embedding strings in
 * inline `<script>` tags during SSR. Based on https://github.com/zertosh/htmlescape
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_LOOKUP[match]!)
}

/**
 * Percent-encode a single path-parameter value so that `/ ? #` etc. in the
 * value cannot change URL structure. The optional `decoder` (from
 * `compileDecodeCharMap`) selectively un-escapes allowed characters.
 */
export function encodePathParam(
  value: string,
  decoder?: (encoded: EncodedPathParam) => string,
): EncodedPathParam {
  const encoded = encodeURIComponent(value)
  return (decoder?.(encoded as EncodedPathParam) ?? encoded) as EncodedPathParam
}

/**
 * Create a pre-compiled decoder that selectively un-escapes characters from
 * `pathParamsAllowedCharacters`. This should be called once at router
 * initialization and passed to `interpolatePath` as `decoder`.
 */
export function compileDecodeCharMap(
  pathParamsAllowedCharacters: ReadonlyArray<string>,
): (encoded: EncodedPathParam) => string {
  const charMap = new Map(
    pathParamsAllowedCharacters.map((char) => [encodeURIComponent(char), char]),
  )
  // Escape special regex characters and join with |
  const pattern = Array.from(charMap.keys())
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(pattern, 'g')
  return (encoded) =>
    encoded.replace(regex, (match) => charMap.get(match) ?? match)
}
