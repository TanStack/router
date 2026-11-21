/**
 * Server-function ids: the stable key of a server fn, the dev id, the
 * custom-id placeholder and the global occupied-id allocator. What a
 * production build prints (the default id, `functionName`, literals,
 * collision order, which custom ids it accepts): `./format`.
 */
import { hash } from 'node:crypto'
import {
  collisionOrder,
  customIdCheck,
  customIdError,
  customIdWarning,
  defaultFunctionId,
} from './format'

export interface ServerFnKey {
  /** Root-relative path of the defining file (forward slashes). */
  rootRel: string
  /** Export name, variable name or structural path. */
  stableKey: string
}

/** The dev id: an opaque encoding of the defining file and key the dev resolver decodes. */
export function devFunctionId(key: ServerFnKey): string {
  return Buffer.from(
    JSON.stringify({ f: key.rootRel, k: key.stableKey }),
    'utf8',
  ).toString('base64url')
}

export function decodeDevFunctionId(id: string): ServerFnKey | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(id, 'base64url').toString('utf8'),
    ) as { f?: unknown; k?: unknown }
    if (typeof decoded.f === 'string' && typeof decoded.k === 'string') {
      return { rootRel: decoded.f, stableKey: decoded.k }
    }
  } catch {
    // not a dev id
  }
  return null
}

const PLACEHOLDER_PREFIX = '__TSS_FN_ID_'
const PLACEHOLDER_SUFFIX = '__'
const PLACEHOLDER_RE = /__TSS_FN_ID_([A-Za-z0-9_-]+)__/g

/** The placeholder token of a server fn whose final id a custom generator decides at `renderChunk`. */
function placeholderToken(key: ServerFnKey): string {
  return Buffer.from(`${key.rootRel}#${key.stableKey}`, 'utf8').toString(
    'base64url',
  )
}

export function placeholderId(key: ServerFnKey): string {
  return `${PLACEHOLDER_PREFIX}${placeholderToken(key)}${PLACEHOLDER_SUFFIX}`
}

/**
 * The gate token of a server fn (J4.2, R182, with a custom generator): one
 * spelling only a compile produces, which every client stub of a build with
 * `generateFunctionId` passes to the runtime, which stores it on the RPC.
 * Its presence in the client's emitted code proves the stub survived. `#`
 * and 16 hex digits: `#` is refused in a custom id (`customIdCheck`) and is
 * no hex digit, so a token equals no id. Never sent, never read at run
 * time.
 */
export function gateToken(key: ServerFnKey): string {
  return (
    '#' +
    hash('sha256', `tss-gate\0${key.rootRel}\0${key.stableKey}`).slice(0, 16)
  )
}

export type GenerateFunctionId = (opts: {
  filename: string
  functionName: string
}) => string | undefined

/**
 * One immutable allocation of final ids against a global occupied set:
 * the client rank first (frozen; under RSC the provider builds first and
 * allocates its entries first: deterministic, not client-first), then
 * server-only entries appended, each rank in `collisionOrder`; custom bases
 * and suffix candidates are both checked.
 */
export class FunctionIdAllocator {
  private readonly occupied = new Set<string>()
  private readonly final = new Map<string, string>()
  /** The error of each placeholder token whose custom id `customIdCheck` refuses. */
  private readonly invalid = new Map<string, string>()

  constructor(private readonly generate: GenerateFunctionId | undefined) {}

  /**
   * Allocates the entries of one rank (those not yet allocated). Returns an
   * error for each entry of the rank whose custom id `customIdCheck`
   * refuses (also when an earlier call allocated it: a rebuild reports it
   * again), and a warning for each entry this call allocates whose custom
   * id it deprecates (once per session).
   */
  allocate(
    entries: Array<
      ServerFnKey & { functionName: string; name: string; ordinal: number }
    >,
  ): { errors: Array<string>; warnings: Array<string> } {
    const errors: Array<string> = []
    const warnings: Array<string> = []
    for (const e of [...entries].sort(collisionOrder)) {
      const token = placeholderToken(e)
      if (!this.final.has(token)) {
        // (an empty id falls back to the default, as it always did)
        const custom =
          this.generate?.({
            filename: e.rootRel,
            functionName: e.functionName,
          }) || undefined
        const check = custom === undefined ? 'ok' : customIdCheck(custom)
        if (check === 'error') {
          this.invalid.set(token, customIdError(e, custom!))
        } else if (check === 'deprecated') {
          warnings.push(customIdWarning(e, custom!))
        }
        const base = custom ?? defaultFunctionId(e)
        let cand = base
        let n = 1
        while (this.occupied.has(cand)) {
          cand = `${base}_${n++}`
        }
        this.occupied.add(cand)
        this.final.set(token, cand)
      }
      const error = this.invalid.get(token)
      if (error !== undefined) {
        errors.push(error)
      }
    }
    return { errors, warnings }
  }

  /**
   * Replaces every placeholder of `code`, escaped for the string literal
   * it is in (the character before it is the quote); unknown tokens are
   * left (a diagnostic for the host).
   */
  patch(code: string): {
    code: string
    edits: Array<{ start: number; end: number; text: string }>
    missing: Array<string>
  } {
    const edits: Array<{ start: number; end: number; text: string }> = []
    const missing: Array<string> = []
    let out = ''
    let last = 0
    PLACEHOLDER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PLACEHOLDER_RE.exec(code)) !== null) {
      const id = this.final.get(m[1]!)
      if (id === undefined) {
        missing.push(m[1]!)
        continue
      }
      const text = escapeFor(code[m.index - 1], id)
      edits.push({ start: m.index, end: m.index + m[0].length, text })
      out += code.slice(last, m.index) + text
      last = m.index + m[0].length
    }
    out += code.slice(last)
    return { code: out, edits, missing }
  }
}

/** The quotes of a string literal (`idLiterals`). */
export const ID_QUOTES = ['"', "'", '`'] as const

/**
 * The string literals a module can print `id` as, in each quote (a
 * minifier picks the quote): what a client build's code holds of a server
 * fn it calls (`StartCompilerSession.publishClientOutput`).
 */
export function idLiterals(id: string): Array<string> {
  return ID_QUOTES.map((quote) => quote + escapeFor(quote, id) + quote)
}

/**
 * The literals a client build's emitted code holds of each server fn it
 * calls (`spelling`: its gate token, or its default id), by literal. Two
 * server fns of one spelling (a token collision) fail the build: neither
 * would be told apart.
 */
export function callSpellings(
  fns: Iterable<{ id: string; spelling: string; name: string }>,
): Map<string, string> {
  const byLiteral = new Map<string, string>()
  const nameOf = new Map<string, string>()
  for (const fn of fns) {
    const other = nameOf.get(fn.spelling)
    if (other !== undefined) {
      throw new Error(
        `[tanstack-start] The server functions ${other} and ${fn.name} have the same build token (${fn.spelling}): rename one of them.`,
      )
    }
    nameOf.set(fn.spelling, fn.name)
    for (const literal of idLiterals(fn.spelling)) {
      byLiteral.set(literal, fn.id)
    }
  }
  return byLiteral
}

/**
 * The ids whose literal (`callSpellings`) is in `codes`. One walk over the
 * code's quote characters, where every literal starts: the literals by
 * their first `k` characters (the shortest literal's length, at most 12),
 * so a quote looks up the few that can start there.
 */
export function calledIds(
  codes: ReadonlyArray<string>,
  literals: ReadonlyMap<string, string>,
): Set<string> {
  const called = new Set<string>()
  if (literals.size === 0) {
    return called
  }
  let k = 12
  for (const literal of literals.keys()) {
    k = Math.min(k, literal.length)
  }
  const byPrefix = new Map<string, Array<[string, string]>>()
  for (const entry of literals) {
    const prefix = entry[0].slice(0, k)
    const same = byPrefix.get(prefix)
    if (same) {
      same.push(entry)
    } else {
      byPrefix.set(prefix, [entry])
    }
  }
  for (const code of codes) {
    for (const quote of ID_QUOTES) {
      for (
        let i = code.indexOf(quote);
        i !== -1;
        i = code.indexOf(quote, i + 1)
      ) {
        for (const [literal, id] of byPrefix.get(code.slice(i, i + k)) ?? []) {
          if (code.startsWith(literal, i)) {
            called.add(id)
          }
        }
      }
    }
  }
  return called
}

/** `id` as the text of a string literal quoted with `quote`. */
function escapeFor(quote: string | undefined, id: string): string {
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return id
  }
  const escaped = id.replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`)
  return quote === '`' ? escaped.replace(/\$\{/g, '\\${') : escaped
}
