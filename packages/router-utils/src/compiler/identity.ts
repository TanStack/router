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

type DerivedKind =
  | 'split'
  | 'shared'
  | 'export'
  | 'hydrate'
  | 'provider'
  | 'handler'

export interface DerivedQuery {
  kind: DerivedKind
  /**
   * Split keys (`component~loader`), the keys of the outputs needing a
   * shared module (`a+b`; parsed from an id: `a~b`, see `ownedQueryPair`),
   * export name, hydrate id, or '' for a provider.
   */
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

/**
 * The format of the owned `tsr-split` value, the Babel splitter's (main's)
 * that apps' chunk naming reads (`/routes/<file>.tsx?tsr-split=<a>---<b>`):
 * a split group's options, sorted, joined by `---`. The modules main had no
 * counterpart for are named in that style after a first key no route option
 * has (the options are a closed set of identifiers: `splitRouteIdentNodes`
 * of the router plugin): `shared---<keys>`, `export---<name>`. One owner: a
 * later switch of the format is this module alone (the compiler's cache keys
 * follow its built code: `compilerCacheKey`).
 */
const KEY_SEPARATOR = '---'
const SHARED_PREFIX = `shared${KEY_SEPARATOR}`
const EXPORT_PREFIX = `export${KEY_SEPARATOR}`

/** The query of an extracted-export output (a `resourceQuery` of the webpack-family hosts' `sideEffects: false` rule). */
export const EXTRACTED_EXPORT_QUERY_RE = new RegExp(
  `[?&]${OWNED_QUERY_KEYS.split}=${EXPORT_PREFIX}`,
)

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
    if (value.startsWith(SHARED_PREFIX)) {
      return {
        kind: 'shared',
        value: splitKeys(value.slice(SHARED_PREFIX.length)),
      }
    }
    if (value.startsWith(EXPORT_PREFIX)) {
      return { kind: 'export', value: value.slice(EXPORT_PREFIX.length) }
    }
    return { kind: 'split', value: splitKeys(value) }
  }
  return null
}

/**
 * Whether a decoded `tsr-split` value names a split group (`component---loader`),
 * not a module the file's outputs share (`shared---…`) or an extracted
 * export (`export---…`).
 */
export function isSplitGroupValue(value: string): boolean {
  return parseDerived(OWNED_QUERY_KEYS.split, value)?.kind === 'split'
}

/** `a---b` → the planners' `a~b`. */
function splitKeys(value: string): string {
  return value.split(KEY_SEPARATOR).join('~')
}

/**
 * An export name may be any string (`export { x as 'a.css' }`), and a bundler
 * reads an id's end as its language, a `/` as a directory and a `!` as a loader
 * separator: anything else than word characters is percent-encoded (`-` too,
 * so that the name never holds the key separator).
 */
function encodeExportName(name: string): string {
  return name.replace(/[^\w$]/gu, (c) =>
    Buffer.from(c).toString('hex').replace(/../g, '%$&'),
  )
}

function ownedQueryPair(q: DerivedQuery): string {
  switch (q.kind) {
    case 'split':
      return `${OWNED_QUERY_KEYS.split}=${q.value.split('~').join(KEY_SEPARATOR)}`
    case 'shared':
      // the options (and other output keys) of the outputs needing it,
      // sorted: within a file an option is in one group, so the set names
      // the module (a parsed `a~b` prints the same)
      return `${OWNED_QUERY_KEYS.split}=${SHARED_PREFIX}${q.value
        .split(/[~+]/)
        .sort()
        .join(KEY_SEPARATOR)}`
    case 'export':
      return `${OWNED_QUERY_KEYS.split}=${EXPORT_PREFIX}${encodeExportName(q.value)}`
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

/** A path with forward slashes, as the hosts and planners compare paths. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/** The value of an owned key; a hand-written one with a bad escape stays as written (no output has that name). */
function decodeOwnedValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * `identify(id).path` without parsing the query (a path ends at the first
 * `?`: `splitQuery`): what the caches index fingerprints and keys by, read
 * per fingerprint of every dependent an invalidation checks.
 */
export function pathOfId(id: string): string {
  const q = id.indexOf('?')
  return q === -1 ? id : id.slice(0, q)
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
        derived = parseDerived(key, decodeOwnedValue(value))
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

/**
 * The specifier an output of a file imports another output of that file by
 * (`targetId`: a derived id, or the canonical id for the env module): its
 * absolute path, as main imported split modules, with the query verbatim.
 * A `#` (`C#`, `project #2`) is escaped as `\0#`, the escape of
 * webpack-family requests (a `#` there starts a fragment). A `!` separates
 * loaders in such a request and has no escape: a path with one is imported
 * by its basename (`./route.tsx?…`), relative to the importer, its own file.
 * The Vite hosts resolve both forms with `resolveSameFileSpecifier`. Printed
 * only through the string printer (`specifierLiteral`).
 */
export function sameFileSpecifier(targetId: string): string {
  const { base, query, hash } = splitQuery(targetId)
  const slash = base.lastIndexOf('/')
  const path =
    slash !== -1 && base.includes('!') ? `./${base.slice(slash + 1)}` : base
  return `${path.replace(/#/g, '\0#')}${query.length > 0 ? `?${query}` : ''}${hash}`
}

/** A specifier `sameFileSpecifier` may have printed that only `resolveSameFileSpecifier` resolves right: an owned key, or an escaped `#`. */
export const SAME_FILE_SPECIFIER_RE = new RegExp(
  `\0#|[?&](?:${Object.values(OWNED_QUERY_KEYS).join('|')})(?:=|&|$)`,
)

/**
 * Resolves a specifier of `sameFileSpecifier` (Vite hosts; webpack and
 * Rspack resolve it themselves) to the id it names, without the file
 * system: only when it names the importer's own file. Null for any other
 * specifier: a browser URL (`/src/routes/a.tsx?tsr-split=component`, Vite
 * dev) looks absolute too and is Vite's to resolve.
 */
export function resolveSameFileSpecifier(
  specifier: string,
  importer: string | undefined,
): string | null {
  if (!importer) {
    return null
  }
  const own = normalizePath(identify(importer).path)
  let id = specifier.replace(/\0#/g, '#')
  if (id.startsWith('./')) {
    id = own.slice(0, own.lastIndexOf('/') + 1) + id.slice(2)
  }
  return normalizePath(identify(id).path) === own ? id : null
}

/**
 * Bundler queries under which a file's module may not be its code: its
 * text, URL, inline data or a worker of it (`x.ts?raw`, `x.svg?inline`).
 * Which ones a script honours: `SCRIPT_ASSET_QUERY_RE` (`isAssetId`).
 */
export const ASSET_QUERY_RE =
  /[?&](?:raw|url|inline|worker|sharedworker)(?:&|$)/

/**
 * The asset queries under which a script's module is not its code (Vite's:
 * its text, URL or a worker of it). No bundler inlines a script
 * (`x.ts?inline` is its code); a host whose bundler runs a script's code
 * under another of them folds that query out of its ids (Rsbuild: `?url`,
 * `?sharedworker`).
 */
export const SCRIPT_ASSET_QUERY_RE =
  /[?&](?:raw|url|worker|sharedworker)(?:&|$)/

/** Whether an id's module is the file's text, URL, inline data or worker (an asset query it honours), not its code. */
export function isAssetId(id: string): boolean {
  return ASSET_QUERY_RE.test(id) && langFromId(id) === null
}

/** Query-aware language of an id: `.vue?vue&type=script&lang.ts` → 'ts'; non-JS (or a script's asset query, `x.ts?raw`) → null. */
export function langFromId(id: string): Lang | null {
  const { base, query, hash } = splitQuery(id)
  if (query.length > 0) {
    // (a bundler honours no asset query followed by a hash in the id: code)
    if (hash.length === 0 && SCRIPT_ASSET_QUERY_RE.test(`?${query}`)) {
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
