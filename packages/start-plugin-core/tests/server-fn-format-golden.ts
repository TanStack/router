/**
 * The golden app of the server-fn output formats (`server-fns/format.ts`):
 * server fns of the shapes earlier Start versions compiled, the custom
 * `generateFunctionId` its builds use, and the extraction of what tooling
 * reads from the built output (the manifest entries, the
 * `createServerRpc` metadata, the ids the client calls), as the raw
 * literal text the bundle holds.
 *
 * `integration/fixtures/server-fn-format-main/record.mjs` builds these
 * files in an e2e app of a checkout of `main` and records the extraction
 * (`main-formats.json`); `integration/start-build-server-fn-format.test.ts`
 * builds them with this checkout and compares. Erasable TypeScript only:
 * the record script loads this module with Node's type stripping.
 */
import { runInNewContext } from 'node:vm'

/** The app's server-fn modules, by path relative to the app root. */
export const goldenFiles: Record<string, string> = {
  'src/compat/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { serverOnlyFn } from './server-only'

export const plainFn = createServerFn().handler(() => 'plain')

const localFn = createServerFn({ method: 'POST' }).handler(() => 'local')
export { localFn }

const innerName = createServerFn().handler(() => 'renamed')
export { innerName as outerName }

export const $dollar = createServerFn().handler(() => 'dollar')

export const café = createServerFn().handler(() => 'cafe')

export const dupA = createServerFn().handler(() => 'dupA')
export const dupB = createServerFn().handler(() => 'dupB')

export const callsServerOnly = createServerFn().handler(async () => {
  return serverOnlyFn()
})

// a collision within a file, declared in reverse alphabetical order
export const zOrder = createServerFn().handler(() => 'zOrder')
export const aOrder = createServerFn().handler(() => 'aOrder')

// a collision across files, with sub/deep.ts \`crossB\`
export const crossA = createServerFn().handler(() => 'crossA')
`,
  'src/compat/sub/deep.ts': `import { createServerFn } from '@tanstack/react-start'

export const deepFn = createServerFn().handler(() => 'deep')

export const crossB = createServerFn().handler(() => 'crossB')
`,
  'src/compat/default.ts': `import { createServerFn } from '@tanstack/react-start'

// a server fn exported as the default export of its module
const viaDefault = createServerFn().handler(() => 'via default')
export default viaDefault
`,
  'src/compat/server-only.ts': `import { createServerFn } from '@tanstack/react-start'

export const serverOnlyFn = createServerFn().handler(() => 'server only')
`,
}

/**
 * The server fns client code calls, by module (relative to `src/`): import
 * specifiers (`default as viaDefault`; the last word is the local name).
 */
export const goldenClientImports: Record<string, Array<string>> = {
  './compat/fns': [
    '$dollar',
    'aOrder',
    'café',
    'callsServerOnly',
    'crossA',
    'dupA',
    'dupB',
    'localFn',
    'outerName',
    'plainFn',
    'zOrder',
  ],
  './compat/sub/deep': ['crossB', 'deepFn'],
  './compat/default': ['default as viaDefault'],
}

/**
 * The provider export of the server fn only other handlers call: earlier
 * Rsbuild builds listed it in the manifest, so anyone could call it over
 * HTTP (J4.2 now keeps it out).
 */
export const serverOnlyFunctionNames = ['serverOnlyFn_createServerFn_handler']

/**
 * The custom generator of the `custom` builds: collisions within a file
 * (`compat-dup`, `compat-order`) and across files (`compat-cross`), an id
 * with a character later versions deprecate (`:`), the default id for a
 * non-ASCII name, and ids embedding the file and `functionName`.
 * Self-contained: the record script prints its source into the app.
 */
export function goldenGenerateFunctionId(opts: {
  filename: string
  functionName: string
}): string | undefined {
  if (!opts.filename.startsWith('src/compat/')) {
    return undefined
  }
  if (/^(zOrder|aOrder)_/.test(opts.functionName)) {
    return 'compat-order'
  }
  if (/^cross[AB]_/.test(opts.functionName)) {
    return 'compat-cross'
  }
  if (opts.functionName.startsWith('dup')) {
    return 'compat-dup'
  }
  if (opts.functionName === 'plainFn_createServerFn_handler') {
    return 'compat:plain'
  }
  if (opts.functionName.startsWith('café')) {
    return undefined
  }
  return `compat-${opts.filename.replace(/[^A-Za-z0-9]+/g, '-')}-${opts.functionName}`
}

/** What tooling reads about the golden server fns from a build's output. */
export interface ServerFnFormatRecord {
  /** The manifest's entries: the raw key and `functionName` literals. */
  manifest: Array<{ key: string; functionName: string }>
  /** The `createServerRpc` metadata of the golden files: raw literals. */
  meta: Array<{ id: string; name: string; filename: string }>
  /** The metadata ids the client output holds (values). */
  clientIds: Array<string>
}

const LITERAL = String.raw`(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`
const MANIFEST_ENTRY = new RegExp(
  String.raw`(${LITERAL}):\s*\{\s*functionName:\s*(${LITERAL})`,
  'g',
)
const META = new RegExp(
  String.raw`\{\s*id:\s*(${LITERAL}),\s*name:\s*(${LITERAL}),\s*filename:\s*(${LITERAL})\s*\}`,
  'g',
)

/** The value of a string literal of the output. */
export function literalValue(raw: string): string {
  return runInNewContext(raw) as string
}

/** The golden server fns' formats in a build's server and client code. */
export function extractServerFnFormat(
  server: ReadonlyArray<string>,
  client: ReadonlyArray<string>,
): ServerFnFormatRecord {
  const meta: ServerFnFormatRecord['meta'] = []
  const manifest: ServerFnFormatRecord['manifest'] = []
  const seen = new Set<string>()
  for (const code of server) {
    for (const m of code.matchAll(META)) {
      const entry = { id: m[1]!, name: m[2]!, filename: m[3]! }
      const key = JSON.stringify(entry)
      if (
        literalValue(entry.filename).startsWith('src/compat/') &&
        !seen.has(key)
      ) {
        seen.add(key)
        meta.push(entry)
      }
    }
  }
  const ids = new Set(meta.map((m) => literalValue(m.id)))
  for (const code of server) {
    for (const m of code.matchAll(MANIFEST_ENTRY)) {
      const entry = { key: m[1]!, functionName: m[2]! }
      const key = JSON.stringify(entry)
      if (ids.has(literalValue(entry.key)) && !seen.has(key)) {
        seen.add(key)
        manifest.push(entry)
      }
    }
  }
  const clientText = client.join('\n')
  const quoted = (id: string) =>
    new RegExp(`['"\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`)
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    manifest: manifest.sort((a, b) => order(a.key, b.key)),
    meta: meta.sort((a, b) => order(a.name, b.name) || order(a.id, b.id)),
    clientIds: [...ids].filter((id) => quoted(id).test(clientText)).sort(order),
  }
}
