import type { AnyStandardSchemaValidateIssue } from './validators'

type IssuePathSegment = PropertyKey | { readonly key: PropertyKey }

function formatIssuePathSegment(segment: IssuePathSegment): string {
  const key =
    typeof segment === 'object' && segment !== null && 'key' in segment
      ? segment.key
      : segment

  if (typeof key === 'number') {
    return `[${key}]`
  }
  if (typeof key === 'symbol') {
    return `[${key.toString()}]`
  }
  // String keys are always bracketed and quoted. This keeps the path
  // unambiguous when a key itself contains "." or "[" (so a literal key
  // "a.b" can't be confused with the nested path a -> b), and it means a
  // key such as "__proto__" is only ever rendered as text, never used to
  // index into an object.
  return `[${JSON.stringify(key)}]`
}

function formatIssuePath(
  path: ReadonlyArray<IssuePathSegment> | undefined,
): string {
  if (!path || path.length === 0) {
    return '(root)'
  }
  return path.map(formatIssuePathSegment).join('')
}

/**
 * Format Standard Schema validation issues into a readable string.
 *
 * Issue objects can hold values that `JSON.stringify` cannot serialize
 * (symbols in paths, circular references), in which case stringifying them
 * throws and hides the original validation failure. This walks the issues
 * defensively and only ever reads the message and path, so the real
 * validation errors survive.
 *
 * Intended for internal use across router-core and start-client-core; it is
 * not part of the documented public API.
 */
export function formatValidationError(
  issues: ReadonlyArray<AnyStandardSchemaValidateIssue> | undefined,
): string {
  if (!issues || issues.length === 0) {
    return 'Validation failed'
  }

  return issues
    .map((issue) => {
      const path = formatIssuePath(issue.path)
      const message =
        typeof issue.message === 'string'
          ? issue.message
          : String(issue.message)
      return `${path}: ${message}`
    })
    .join('\n')
}
