import type { AnyStandardSchemaValidateIssue } from './validators'

/**
 * Keys that can appear in a Standard Schema issue path. The spec allows a bare
 * key or an object carrying one, and the key itself may be a symbol.
 */
type IssuePathKey = string | number | symbol

const SAFE_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Reads the key out of a path segment. The segment is either the key itself or
 * an object with a `key` property. Anything else is not a key we can render.
 */
function readSegmentKey(segment: unknown): IssuePathKey | undefined {
  if (
    typeof segment === 'string' ||
    typeof segment === 'number' ||
    typeof segment === 'symbol'
  ) {
    return segment
  }
  if (segment !== null && typeof segment === 'object') {
    try {
      const key = (segment as { key?: unknown }).key
      if (
        typeof key === 'string' ||
        typeof key === 'number' ||
        typeof key === 'symbol'
      ) {
        return key
      }
    } catch {
      // a getter that throws is not a key we can use
    }
  }
  return undefined
}

/**
 * Renders one key. Bracket-quoting anything that is not a plain identifier is
 * what keeps paths unambiguous: the two-key path `['a', 'b']` renders `a.b`,
 * while the single key `'a.b'` renders `["a.b"]`, so they can never collide.
 * A numeric key renders as an index, and the string `'0'` renders as `["0"]`,
 * keeping those distinct too.
 */
function renderKey(key: IssuePathKey, isFirst: boolean): string {
  if (typeof key === 'number') {
    return `[${key}]`
  }
  const text = typeof key === 'symbol' ? key.toString() : key
  if (typeof key === 'string' && SAFE_KEY_RE.test(key)) {
    return isFirst ? text : `.${text}`
  }
  return `[${JSON.stringify(text)}]`
}

function formatIssuePath(path: ReadonlyArray<unknown>): string {
  let rendered = ''
  let isFirst = true
  for (const segment of path) {
    const key = readSegmentKey(segment)
    if (key === undefined) continue
    rendered += renderKey(key, isFirst)
    isFirst = false
  }
  return rendered
}

function formatIssue(issue: unknown): string {
  let message = ''
  try {
    const raw = (issue as { message?: unknown } | null | undefined)?.message
    if (raw !== undefined && raw !== null) message = String(raw)
  } catch {
    // fall through to the generic message below
  }
  if (!message) message = 'Invalid value'

  let path = ''
  try {
    const raw = (issue as { path?: unknown } | null | undefined)?.path
    if (Array.isArray(raw) && raw.length > 0) path = formatIssuePath(raw)
  } catch {
    // an unreadable path is reported as a root issue
  }

  return path ? `${path}: ${message}` : message
}

/**
 * Turns Standard Schema issues into a readable message.
 *
 * `JSON.stringify` cannot be used here: an issue may carry values it refuses to
 * serialize, such as a bigint, which throws, or a circular reference, and the
 * resulting blob hid the messages that explain the failure. Only the message
 * and the path are read, each defensively, so a hostile or exotic issue object
 * still produces a usable error.
 */
export function formatStandardSchemaIssues(
  issues: ReadonlyArray<AnyStandardSchemaValidateIssue> | undefined,
): string {
  if (!issues || issues.length === 0) return 'Validation failed'
  const lines: Array<string> = []
  for (const issue of issues) {
    lines.push(formatIssue(issue))
  }
  return lines.join('\n')
}
