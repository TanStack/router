import { relativizePath } from './utils'

export interface TraceStep {
  file: string
  specifier?: string
  line?: number
  column?: number
}

export interface Loc {
  file?: string
  line: number
  column: number
}

export interface ViolationInfo {
  env: string
  envType: 'client' | 'server'
  type: 'specifier' | 'file' | 'marker'
  behavior: 'error' | 'mock'
  pattern?: string | RegExp
  specifier: string
  importer: string
  importerLoc?: Loc
  resolved?: string
  trace: Array<TraceStep>
  /** Vitest-style code snippet showing the offending usage in the leaf module. */
  snippet?: {
    lines: Array<string>
    highlightLine: number
    location: string
  }
}

/**
 * Suggestion strings for server-only code leaking into client environments.
 * Used by both `formatViolation` (terminal) and runtime mock modules (browser).
 */
export const CLIENT_ENV_SUGGESTIONS = [
  'Use createServerFn().handler(() => ...) to keep the logic on the server and call it from the client via an RPC bridge',
  'Use createServerOnlyFn(() => ...) to mark it as server-only (it will throw if accidentally called from the client)',
  'Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations',
  'Move the server-only import out of this file into a separate .server.ts module that is not imported by any client code',
] as const

/**
 * Suggestion strings for client-only code leaking into server environments.
 * The JSX-specific suggestion is conditionally prepended by `formatViolation`.
 */
export const SERVER_ENV_SUGGESTIONS = [
  'Use createClientOnlyFn(() => ...) to mark it as client-only (returns undefined on the server)',
  'Use createIsomorphicFn().client(() => ...).server(() => ...) to provide separate client and server implementations',
  'Move the client-only import out of this file into a separate .client.ts module that is not imported by any server code',
] as const

export function formatViolation(info: ViolationInfo, root: string): string {
  const rel = (p: string) => relativizePath(p, root)

  const relLoc = (p: string, loc?: Loc) => {
    const r = rel(p)
    const file = loc?.file ? rel(loc.file) : r
    return loc ? `${file}:${loc.line}:${loc.column}` : r
  }

  const relTraceStep = (step: TraceStep): string => {
    const file = rel(step.file)
    if (step.line == null) return file
    const col = step.column ?? 1
    return `${file}:${step.line}:${col}`
  }

  const lines: Array<string> = []
  lines.push(``)
  lines.push(`[import-protection] Import denied in ${info.envType} environment`)
  lines.push(``)

  if (info.type === 'specifier') {
    lines.push(`  Denied by specifier pattern: ${String(info.pattern)}`)
  } else if (info.type === 'file') {
    lines.push(`  Denied by file pattern: ${String(info.pattern)}`)
  } else {
    lines.push(
      `  Denied by marker: module is restricted to the opposite environment`,
    )
  }

  lines.push(`  Importer: ${relLoc(info.importer, info.importerLoc)}`)
  lines.push(`  Import: "${rel(info.specifier)}"`)
  if (info.resolved) {
    lines.push(`  Resolved: ${rel(info.resolved)}`)
  }

  if (info.trace.length > 0) {
    lines.push(``)
    lines.push(`  Trace:`)
    for (let i = 0; i < info.trace.length; i++) {
      const step = info.trace[i]!
      const isEntry = i === 0
      const tag = isEntry ? ' (entry)' : ''
      const spec = step.specifier ? ` (import "${rel(step.specifier)}")` : ''
      lines.push(`    ${i + 1}. ${relTraceStep(step)}${tag}${spec}`)
    }
  }

  if (info.snippet) {
    lines.push(``)
    lines.push(`  Code:`)
    for (const snippetLine of info.snippet.lines) {
      lines.push(snippetLine)
    }
    lines.push(``)
    lines.push(`  ${rel(info.snippet.location)}`)
  }

  lines.push(``)

  // Add suggestions
  if (info.envType === 'client') {
    lines.push(`  Suggestions:`)
    for (const s of CLIENT_ENV_SUGGESTIONS) {
      lines.push(`    - ${s}`)
    }
  } else {
    const snippetText = info.snippet?.lines.join('\n') ?? ''
    const looksLikeJsx =
      /<[A-Z]/.test(snippetText) ||
      (/\{.*\(.*\).*\}/.test(snippetText) && /</.test(snippetText))

    lines.push(`  Suggestions:`)
    if (looksLikeJsx) {
      lines.push(
        `    - Wrap the JSX in <ClientOnly fallback={<Loading />}>...</ClientOnly> so it only renders in the browser after hydration`,
      )
    }
    for (const s of SERVER_ENV_SUGGESTIONS) {
      lines.push(`    - ${s}`)
    }
  }

  lines.push(``)
  return lines.join('\n')
}
