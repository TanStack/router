import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative, dirname, isAbsolute } from 'pathe'
import { glob } from 'tinyglobby'
import type { BunStandaloneOptions } from './types'

export interface BunStandaloneCompileResult {
  outfile: string
}

/** Default standalone executable path under server out dir. */
function defaultOutfile(serverOutDir: string): string {
  const base = join(serverOutDir, 'start')
  if (process.platform === 'win32') {
    return `${base}.exe`
  }
  return base
}

/** Resolve the standalone compile output path (incl. `.exe`). */
function resolveOutfile(
  root: string,
  serverOutDir: string,
  standalone: BunStandaloneOptions,
): string {
  const raw = standalone.outfile ?? defaultOutfile(serverOutDir)
  const abs = isAbsolute(raw) ? raw : join(root, raw)
  if (
    process.platform === 'win32' &&
    !abs.toLowerCase().endsWith('.exe') &&
    !standalone.target
  ) {
    return `${abs}.exe`
  }
  if (
    typeof standalone.target === 'string' &&
    standalone.target.startsWith('windows') &&
    !abs.toLowerCase().endsWith('.exe')
  ) {
    return `${abs}.exe`
  }
  return abs
}

/** Relative import specifier from the standalone entry to an asset. */
function toImportSpecifier(fromFile: string, assetAbs: string): string {
  let rel = relative(dirname(fromFile), assetAbs)
  if (!rel.startsWith('.')) {
    rel = `./${rel}`
  }
  // Bun on Windows accepts / in import paths
  return rel.replace(/\\/g, '/')
}

/** Public URL path for an embedded client asset (honors publicBase). */
function publicUrlPath(
  clientOutDir: string,
  assetAbs: string,
  publicBase: string,
): string {
  const rel = relative(clientOutDir, assetAbs).replace(/\\/g, '/')
  const base =
    !publicBase || publicBase === '/'
      ? ''
      : publicBase.replace(/\/$/, '')
  return `${base}/${rel}`
}

/** @internal exported for unit tests */
export function buildStandaloneEntrySource(opts: {
  assetFiles: Array<string>
  clientOutDir: string
  entryPath: string
  publicBase?: string
}): string {
  const publicBase = opts.publicBase ?? '/'
  const importLines: Array<string> = [
    `import * as handler from ${JSON.stringify('./server.js')}`,
  ]
  const mapEntries: Array<string> = []

  for (let i = 0; i < opts.assetFiles.length; i++) {
    const abs = opts.assetFiles[i]!
    const spec = toImportSpecifier(opts.entryPath, abs)
    const id = `asset_${i}`
    importLines.push(
      `import ${id} from ${JSON.stringify(spec)} with { type: "file" }`,
    )
    const urlPath = publicUrlPath(opts.clientOutDir, abs, publicBase)
    mapEntries.push(`  [${JSON.stringify(urlPath)}, ${id}]`)
  }

  return `${importLines.join('\n')}

const assets = new Map([
${mapEntries.join(',\n')}
])

function resolveEmbedded(pathname) {
  if (assets.has(pathname)) {
    return assets.get(pathname)
  }
  if (pathname.endsWith('/')) {
    const withIndex = pathname + 'index.html'
    if (assets.has(withIndex)) {
      return assets.get(withIndex)
    }
  }
  if (!pathname.includes('.') && assets.has(pathname + '.html')) {
    return assets.get(pathname + '.html')
  }
  if (pathname === '/' && assets.has('/index.html')) {
    return assets.get('/index.html')
  }
  return null
}

function resolveFetchHandler(mod) {
  const candidates = [mod?.default, mod?.default?.default, mod]
  for (const candidate of candidates) {
    if (candidate && typeof candidate.fetch === 'function') {
      return (req) => candidate.fetch(req)
    }
  }
  throw new Error(
    '[tanstack-start-bun] standalone: server entry missing default.fetch',
  )
}

const fetchHandler = resolveFetchHandler(handler)

const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'

const server = Bun.serve({
  port,
  hostname,
  async fetch(req) {
    const url = new URL(req.url)
    const embedded = resolveEmbedded(url.pathname)
    if (embedded) {
      // import with { type: "file" } yields a bunfs path string
      return new Response(Bun.file(embedded))
    }
    return fetchHandler(req)
  },
})

console.info(\`[tanstack-start-bun] standalone http://\${hostname}:\${server.port}\`)
`
}

/**
 * After dual Bun.build + post-build, optionally `Bun.build({ compile })`
 * a single executable that embeds `dist/client` and serves via server.js.
 */
export async function runBunStandaloneCompile(opts: {
  root: string
  clientOutDir: string
  serverOutDir: string
  standalone: BunStandaloneOptions
  publicBase?: string
}): Promise<BunStandaloneCompileResult> {
  const outfile = resolveOutfile(
    opts.root,
    opts.serverOutDir,
    opts.standalone,
  )
  await mkdir(dirname(outfile), { recursive: true })

  const assetFiles = (
    await glob(['**/*'], {
      cwd: opts.clientOutDir,
      absolute: true,
      onlyFiles: true,
      dot: false,
    })
  ).sort()

  const entryPath = join(opts.serverOutDir, '.standalone-entry.js')
  const entrySource = buildStandaloneEntrySource({
    assetFiles,
    clientOutDir: opts.clientOutDir,
    entryPath,
    publicBase: opts.publicBase,
  })

  await writeFile(entryPath, entrySource, 'utf8')

  const compileOpt: Record<string, unknown> = {
    ...(opts.standalone.compile ?? {}),
    outfile,
  }
  if (opts.standalone.target != null) {
    compileOpt.target = opts.standalone.target
  }

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: 'bun',
    format: 'esm',
    packages: 'bundle',
    sourcemap: 'none',
    // outfile must live under `compile` (top-level outfile is ignored when compiling)
    compile: compileOpt,
  } as import('bun').BuildConfig)

  if (!result.success) {
    const message = result.logs.map(String).join('\n')
    throw new Error(
      `[tanstack-start-bun] bun.standalone compile failed (see Bun --compile limits for native addons / dynamic requires):\n${message}`,
    )
  }

  const written =
    result.outputs.find((o) => o.kind === 'entry-point')?.path ?? outfile
  return { outfile: written }
}
