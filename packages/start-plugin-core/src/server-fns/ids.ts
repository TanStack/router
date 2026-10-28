/**
 * Server-function ids: the stable key of a
 * server fn, the default production id, the dev id, the custom-id
 * placeholder and the global occupied-id allocator.
 */
import { hash } from 'node:crypto'

export interface ServerFnKey {
  /** Root-relative path of the defining file (forward slashes). */
  rootRel: string
  /** Export name, variable name or structural path. */
  stableKey: string
}

/** The default production id: base64url of a sha256 prefix (no path leak, ~22 chars). */
export function defaultFunctionId(key: ServerFnKey): string {
  return hash('sha256', `${key.rootRel}#${key.stableKey}`, 'base64url').slice(
    0,
    22,
  )
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
export const PLACEHOLDER_RE = /__TSS_FN_ID_([A-Za-z0-9_-]+)__/g

/** The placeholder token of a server fn whose final id a custom generator decides at `renderChunk`. */
export function placeholderToken(key: ServerFnKey): string {
  return Buffer.from(`${key.rootRel}#${key.stableKey}`, 'utf8').toString(
    'base64url',
  )
}

export function placeholderId(key: ServerFnKey): string {
  return `${PLACEHOLDER_PREFIX}${placeholderToken(key)}${PLACEHOLDER_SUFFIX}`
}

export type GenerateFunctionId = (opts: {
  filename: string
  functionName: string
}) => string | undefined

/**
 * One immutable allocation of final ids against a global occupied set:
 * the client rank first (sorted stable keys, frozen; under RSC the provider
 * builds first and allocates its entries first: deterministic, not
 * client-first), then server-only
 * entries appended; custom bases and suffix candidates are both checked.
 */
export class FunctionIdAllocator {
  private readonly occupied = new Set<string>()
  private readonly final = new Map<string, string>()

  constructor(private readonly generate: GenerateFunctionId | undefined) {}

  has(token: string): boolean {
    return this.final.has(token)
  }

  get(token: string): string | undefined {
    return this.final.get(token)
  }

  /** Allocates the entries of one rank (those not yet allocated), in sorted key order. */
  allocate(entries: Array<ServerFnKey>): void {
    const sorted = [...entries].sort(
      (a, b) =>
        (a.rootRel < b.rootRel ? -1 : a.rootRel > b.rootRel ? 1 : 0) ||
        (a.stableKey < b.stableKey ? -1 : a.stableKey > b.stableKey ? 1 : 0),
    )
    for (const e of sorted) {
      const token = placeholderToken(e)
      if (this.final.has(token)) {
        continue
      }
      const base =
        this.generate?.({ filename: e.rootRel, functionName: e.stableKey }) ??
        defaultFunctionId(e)
      let cand = base
      let n = 1
      while (this.occupied.has(cand)) {
        cand = `${base}_${n++}`
      }
      this.occupied.add(cand)
      this.final.set(token, cand)
    }
  }

  /** Replaces every placeholder of `code`; unknown tokens are left (a diagnostic for the host). */
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
      edits.push({ start: m.index, end: m.index + m[0].length, text: id })
      out += code.slice(last, m.index) + id
      last = m.index + m[0].length
    }
    out += code.slice(last)
    return { code: out, edits, missing }
  }
}
