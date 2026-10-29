/**
 * Source identity, derived ids and revisions.
 *
 * The canonical id is the host id minus only the compiler-owned query keys.
 * Foreign query keys (order, values), `\0` prefixes and virtual ids stay
 * verbatim, so `page.tsx?flavour=b` and `page.tsx?flavour=a` are distinct
 * sources, and `page.tsx?flavour=b&tsr-split=component` plans with
 * `page.tsx?flavour=b`.
 */
import { hash } from 'node:crypto'

export type DerivedKind =
  | 'split'
  | 'shared'
  | 'export'
  | 'hydrate'
  | 'provider'
  | 'handler'

export interface DerivedQuery {
  kind: DerivedKind
  /** Split keys (`component~loader`), shared group keys (`a+b`), export name, hydrate id, or '' for a provider. */
  value: string
}

export interface SourceIdentity {
  /** The id the bundler passed (path?query, \0virtual, …) minus ONLY the compiler-owned query keys. */
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
  handler: 'tss-serverfn-handler',
} as const

const OWNED_KEY_SET = new Set<string>(Object.values(OWNED_QUERY_KEYS))

/**
 * Splits a host id into path, query and fragment. A project path may carry
 * `#` (`C#`, `project #2`), and Vite and Rspack hand such ids with the `#`
 * as it is: a `#` is a URL fragment only after the query. (`?` cannot be
 * part of a Windows path; on other systems a `?` in the project path is not
 * supported by the bundlers either.)
 */
function splitQuery(id: string): { base: string; query: string; hash: string } {
  const q = id.indexOf('?')
  if (q === -1) {
    return { base: id, query: '', hash: '' }
  }
  const rest = id.slice(q + 1)
  const hashAt = rest.indexOf('#')
  if (hashAt === -1) {
    return { base: id.slice(0, q), query: rest, hash: '' }
  }
  return {
    base: id.slice(0, q),
    query: rest.slice(0, hashAt),
    hash: rest.slice(hashAt),
  }
}

function parseDerived(key: string, value: string): DerivedQuery | null {
  if (key === OWNED_QUERY_KEYS.hydrate) {
    return { kind: 'hydrate', value }
  }
  if (key === OWNED_QUERY_KEYS.provider) {
    return { kind: 'provider', value }
  }
  if (key === OWNED_QUERY_KEYS.handler) {
    return { kind: 'handler', value }
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
    case 'handler':
      return OWNED_QUERY_KEYS.handler
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
    canonicalId,
    path: base,
    foreignQuery,
    derived,
    lang: langFromId(hostId),
  }
}

/**
 * Adds the owned key to the canonical id's existing query; never reorders or
 * drops foreign keys. A trailing language key (`Page.vue?vue&type=script&lang.ts`,
 * how `@vitejs/plugin-vue` serves an SFC block) stays last: other plugins
 * pick the transform by the id's ending.
 */
export function deriveId(canonicalId: string, q: DerivedQuery): string {
  const { base, query, hash } = splitQuery(canonicalId)
  const pair = ownedQueryPair(q)
  if (query.length === 0) {
    return `${base}?${pair}${hash}`
  }
  const last = query.lastIndexOf('&') + 1
  if (/^lang\.\w+$/.test(query.slice(last))) {
    return `${base}?${query.slice(0, last)}${pair}&${query.slice(last)}${hash}`
  }
  return `${base}?${query}&${pair}${hash}`
}

/** The glue specifier a sibling output uses to import from `target` (same directory, hostile basenames allowed). */
export function siblingSpecifier(targetId: string): string {
  const { base, query, hash } = splitQuery(targetId)
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  const basename = slash === -1 ? base : base.slice(slash + 1)
  return `./${basename}${query.length > 0 ? `?${query}` : ''}${hash}`
}

/** Bundler queries whose module is not the file's code (`?raw`, `?url`, `?inline`, `?worker`): the file is an asset of it. */
export const ASSET_QUERY_RE =
  /[?&](?:raw|url|inline|worker|sharedworker)(?:&|$)/

/** Query-aware language of an id: `.vue?vue&type=script&lang.ts` → 'ts'; non-JS (or an asset query, `x.ts?raw`) → null. */
export function langFromId(id: string): Lang | null {
  const { base, query } = splitQuery(id)
  if (query.length > 0) {
    if (ASSET_QUERY_RE.test(`?${query}`)) {
      return null
    }
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
  return hash('sha1', code, 'base64url').slice(0, 22)
}

/** Stable digest of plain data (canonical JSON with sorted keys). */
export function digestOf(value: unknown): string {
  return hash('sha1', canonicalJson(value), 'base64url').slice(0, 22)
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    return 'null'
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  let out: string
  if (Array.isArray(value)) {
    out = '['
    for (let i = 0; i < value.length; i++) {
      if (i > 0) {
        out += ','
      }
      out += canonicalJson(value[i])
    }
    return out + ']'
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length > 1) {
    keys.sort()
  }
  out = '{'
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      out += ','
    }
    out += JSON.stringify(keys[i]) + ':' + canonicalJson(record[keys[i]!])
  }
  return out + '}'
}

/**
 * The key of an import edge: unique per (environment, layer, importer,
 * specifier, form, origin) within a request. A plain join (one key per edge
 * per output on every compile); an id derived from it hashes it
 * (`edgeModuleKey`).
 */
export function edgeKeyOf(
  env: string,
  layer: string | null | undefined,
  importer: string,
  rawSpecifier: string,
  form: string,
  origin = 'source',
): string {
  return `${env}\0${layer ?? ''}\0${importer}\0${rawSpecifier}\0${form}\0${origin}`
}

export function planKeyString(key: PlanKey): string {
  return `${key.env}\u0000${key.canonicalId}\u0000${key.configKey}`
}
