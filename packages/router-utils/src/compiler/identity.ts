/**
 * Source identity, derived ids and revisions (DESIGN §2.1, R3, R35).
 *
 * The canonical id is the host id minus only the compiler-owned query keys.
 * Foreign query keys (order, values), `\0` prefixes and virtual ids stay
 * verbatim, so `page.tsx?flavour=b` and `page.tsx?flavour=a` are distinct
 * sources, and `page.tsx?flavour=b&tsr-split=component` plans with
 * `page.tsx?flavour=b`.
 */
import { createHash } from 'node:crypto'

export type DerivedKind = 'split' | 'shared' | 'export' | 'hydrate' | 'provider'

export interface DerivedQuery {
  kind: DerivedKind
  /** Split keys (`component~loader`), shared group keys (`a+b`), export name, hydrate id, or '' for a provider. */
  value: string
}

export interface SourceIdentity {
  /** Exactly what the bundler passed (path?query, \0virtual, …). */
  hostId: string
  /** hostId minus ONLY the compiler-owned query keys. */
  canonicalId: string
  /** canonicalId without any query — fs watching, path-based rules, map `sources` only. */
  path: string
  /** The foreign query of the canonical id, without the leading `?` ('' when none). */
  foreignQuery: string
  derived: DerivedQuery | null
  lang: Lang | null
}

export type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

export interface PlanKey {
  env: string
  canonicalId: string
  configKey: string
}

export const OWNED_QUERY_KEYS = {
  split: 'tsr-split',
  hydrate: 'tss-hydrate',
  provider: 'tss-serverfn-split',
} as const

const OWNED_KEY_SET = new Set<string>(Object.values(OWNED_QUERY_KEYS))

function splitQuery(id: string): { base: string; query: string; hash: string } {
  const hashAt = id.indexOf('#')
  const hash = hashAt === -1 ? '' : id.slice(hashAt)
  const noHash = hashAt === -1 ? id : id.slice(0, hashAt)
  const q = noHash.indexOf('?')
  if (q === -1) {
    return { base: noHash, query: '', hash }
  }
  return { base: noHash.slice(0, q), query: noHash.slice(q + 1), hash }
}

function parseDerived(key: string, value: string): DerivedQuery | null {
  if (key === OWNED_QUERY_KEYS.hydrate) {
    return { kind: 'hydrate', value }
  }
  if (key === OWNED_QUERY_KEYS.provider) {
    return { kind: 'provider', value }
  }
  if (key === OWNED_QUERY_KEYS.split) {
    if (value.startsWith('shared~')) {
      return { kind: 'shared', value: value.slice('shared~'.length) }
    }
    if (value.startsWith('export~')) {
      return { kind: 'export', value: value.slice('export~'.length) }
    }
    return { kind: 'split', value }
  }
  return null
}

function ownedQueryPair(q: DerivedQuery): string {
  switch (q.kind) {
    case 'split':
      return `${OWNED_QUERY_KEYS.split}=${q.value}`
    case 'shared':
      return `${OWNED_QUERY_KEYS.split}=shared~${q.value}`
    case 'export':
      return `${OWNED_QUERY_KEYS.split}=export~${q.value}`
    case 'hydrate':
      return `${OWNED_QUERY_KEYS.hydrate}=${q.value}`
    case 'provider':
      return q.value
        ? `${OWNED_QUERY_KEYS.provider}=${q.value}`
        : OWNED_QUERY_KEYS.provider
  }
}

/** Maps a host id to its canonical identity. Never canonicalises virtual ids beyond their owned keys. */
export function identify(hostId: string): SourceIdentity {
  const { base, query, hash } = splitQuery(hostId)
  let derived: DerivedQuery | null = null
  const foreign: Array<string> = []
  if (query.length > 0) {
    for (const part of query.split('&')) {
      if (part.length === 0) {
        continue
      }
      const eq = part.indexOf('=')
      const key = eq === -1 ? part : part.slice(0, eq)
      const value = eq === -1 ? '' : part.slice(eq + 1)
      if (OWNED_KEY_SET.has(key)) {
        // Several owned keys on one id: the last one wins; earlier ones are dropped.
        derived = parseDerived(key, decodeURIComponent(value))
      } else {
        foreign.push(part)
      }
    }
  }
  const foreignQuery = foreign.join('&')
  const canonicalId =
    base + (foreignQuery.length > 0 ? `?${foreignQuery}` : '') + hash
  return {
    hostId,
    canonicalId,
    path: base,
    foreignQuery,
    derived,
    lang: langFromId(hostId),
  }
}

/** Adds the owned key to the canonical id's existing query; never reorders or drops foreign keys. */
export function deriveId(canonicalId: string, q: DerivedQuery): string {
  const { base, query, hash } = splitQuery(canonicalId)
  const pair = ownedQueryPair(q)
  return `${base}?${query.length > 0 ? `${query}&` : ''}${pair}${hash}`
}

/** The glue specifier a sibling output uses to import from `target` (same directory, hostile basenames allowed). */
export function siblingSpecifier(targetId: string): string {
  const { base, query, hash } = splitQuery(targetId)
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  const basename = slash === -1 ? base : base.slice(slash + 1)
  return `./${basename}${query.length > 0 ? `?${query}` : ''}${hash}`
}

/** Query-aware language of an id: `.vue?vue&type=script&lang.ts` → 'ts'; non-JS → null. */
export function langFromId(id: string): Lang | null {
  const { base, query } = splitQuery(id)
  if (query.length > 0) {
    const m = /(?:^|&)lang\.(tsx|ts|jsx|js|mjs|cjs|mts|cts)(?:$|&|=)/.exec(
      query,
    )
    if (m) {
      return extLang(m[1]!)
    }
  }
  const dot = base.lastIndexOf('.')
  if (dot === -1) {
    return null
  }
  return extLang(base.slice(dot + 1))
}

function extLang(ext: string): Lang | null {
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'ts'
    case 'tsx':
      return 'tsx'
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      // Babel in the router enabled JSX for every non-`.ts` file; Yuku's `js` has no JSX.
      return 'jsx'
    default:
      return null
  }
}

/** Whether the path is CommonJS by extension (`.cjs`, `.cts`): a safe non-transform (J4.16). */
export function isCommonJsPath(path: string): boolean {
  return /\.c[jt]s$/.test(path)
}

/** Content revision of an input text (plan freshness; never consumer invalidation). */
export function revision(code: string): string {
  return createHash('sha1')
    .update(code, 'utf8')
    .digest('base64url')
    .slice(0, 22)
}

/** Stable digest of plain data (canonical JSON with sorted keys). */
export function digestOf(value: unknown): string {
  return createHash('sha1')
    .update(canonicalJson(value), 'utf8')
    .digest('base64url')
    .slice(0, 22)
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    return 'null'
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`
}

export function planKeyString(key: PlanKey): string {
  return `${key.env}\u0000${key.canonicalId}\u0000${key.configKey}`
}
