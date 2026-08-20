/**
 * Vite-like dependency prebundling for Bun ESM-dev.
 *
 * Scans app sources for bare imports, bundles each entry with Bun.build into
 * `node_modules/.tanstack-start/deps`, and rewrites those imports to `/@deps/…`
 * so the browser loads a few fat files instead of thousands of `/@fs` modules.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, relative } from 'pathe'

export const DEPS_PREFIX = '/@deps'
export const DEPS_CACHE_DIR = 'node_modules/.tanstack-start/deps'

/** React singletons: one shared prebundle; other deps externalize these. */
export const OPTIMIZE_DEPS_REACT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
  'scheduler',
] as const

export type OptimizeDepsConfig = {
  /** Extra bare specs to always prebundle. */
  include?: Array<string>
  /** Bare specs (or package name prefixes) to skip. */
  exclude?: Array<string>
  /** Disable prebundling (fall back to per-file `/@fs`). */
  disabled?: boolean
  /** Ignore disk cache and rebuild. */
  force?: boolean
}

export type OptimizeDepsResult = {
  depsDir: string
  urlForSpec: (spec: string) => string | undefined
  resolvePath: (pathname: string) => string | null
  count: number
}

type Metadata = {
  hash: string
  /** specifier → filename under depsDir */
  map: Record<string, string>
}

const IMPORT_SPEC_RE =
  /(\bfrom\s+|\bimport\s*\(\s*)(['"])([^'"]+)\2|(\bimport\s+)(['"])([^'"]+)\5/g

/** Packages that must stay on `/@fs` for Start compiler / dual-package remap. */
const DEFAULT_EXCLUDE_PREFIXES = [
  '@tanstack/react-start',
  '@tanstack/solid-start',
  '@tanstack/vue-start',
  '@tanstack/start-client-core',
  '@tanstack/start-server-core',
  '@tanstack/start-plugin-core',
  // Server / Node-only — never ship to the browser graph
  '@prisma-next',
  'prisma-next',
  '@modelcontextprotocol',
  'commander',
]

function isBareSpecifier(spec: string): boolean {
  if (!spec || /[\s+]/.test(spec)) return false
  if (
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('file:') ||
    spec.startsWith('data:') ||
    spec.startsWith('blob:') ||
    spec.startsWith('http:') ||
    spec.startsWith('https:') ||
    spec.startsWith('node:') ||
    spec.startsWith('#') ||
    spec.startsWith('virtual:')
  ) {
    return false
  }
  return true
}

function isExcluded(spec: string, exclude: Array<string>): boolean {
  for (const rule of exclude) {
    if (spec === rule || spec.startsWith(`${rule}/`)) return true
  }
  return false
}

function isReactFamily(spec: string): boolean {
  return /^(react|react-dom|scheduler)(\/|$)/.test(spec)
}

function packageRootFromResolved(absPath: string): string | null {
  const n = absPath.replace(/\\/g, '/')
  const marker = '/node_modules/'
  const idx = n.lastIndexOf(marker)
  if (idx === -1) return null
  let rest = n.slice(idx + marker.length)
  const bunInner = rest.indexOf('/node_modules/')
  if (rest.startsWith('.bun/') && bunInner !== -1) {
    rest = rest.slice(bunInner + '/node_modules/'.length)
  }
  if (rest.startsWith('@')) {
    const parts = rest.split('/')
    if (parts.length < 2) return null
    return parts.slice(0, 2).join('/')
  }
  return rest.split('/')[0] ?? null
}

function depsFileName(spec: string): string {
  const trimmed = spec.replace(/\.(m|c)?js$/i, '')
  return `${trimmed
    .replace(/^@/, '')
    .replace(/\//g, '__')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')}.js`
}

/** Whether an app file should be crawled for bare imports (skip server/cli). */
function shouldCrawlAppFile(absPath: string, root: string): boolean {
  const rel = relative(root, absPath).replace(/\\/g, '/')
  if (rel.startsWith('..')) return false
  if (rel.includes('/node_modules/') || rel.startsWith('node_modules/')) {
    return false
  }
  if (
    /(?:^|\/)server(?:\/|$)/.test(rel) ||
    /(?:^|\/)cli(?:\/|$)/.test(rel) ||
    /(?:^|\/)mcp(?:\/|$)/.test(rel)
  ) {
    return false
  }
  return true
}

async function scanAppBareImports(
  root: string,
  clientEntryPath: string,
  aliases?: Record<string, string>,
): Promise<Set<string>> {
  const specs = new Set<string>()
  const queue: Array<string> = []
  const seenFiles = new Set<string>()

  const enqueue = (abs: string) => {
    const n = normalize(abs.split('?')[0]!)
    if (seenFiles.has(n) || !shouldCrawlAppFile(n, root)) return
    if (!existsSync(n)) return
    seenFiles.add(n)
    queue.push(n)
  }

  enqueue(clientEntryPath)
  // Seed common client roots when entry is a thin virtual wrapper
  for (const seed of [
    join(root, 'src/router.tsx'),
    join(root, 'src/routeTree.gen.ts'),
    join(root, 'src/routes'),
    join(root, 'src/components'),
    join(root, 'src/modules'),
    join(root, 'src/lib'),
  ]) {
    if (!existsSync(seed)) continue
    if (seed.endsWith('routes') || !seed.includes('.')) {
      const glob = new Bun.Glob('**/*.{ts,tsx,js,jsx}')
      for await (const rel of glob.scan({ cwd: seed, onlyFiles: true })) {
        enqueue(join(seed, rel))
      }
    } else {
      enqueue(seed)
    }
  }

  while (queue.length > 0) {
    const file = queue.pop()!
    let code: string
    try {
      code = await readFile(file, 'utf8')
    } catch {
      continue
    }
    IMPORT_SPEC_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_SPEC_RE.exec(code))) {
      const spec = (m[3] ?? m[6]) as string
      if (isBareSpecifier(spec)) {
        specs.add(spec)
        continue
      }
      if (spec.startsWith('#/') || spec.startsWith('#tanstack')) {
        try {
          const resolved = Bun.resolveSync(spec, root)
          enqueue(resolved)
        } catch {
          try {
            const resolved = Bun.resolveSync(spec, dirname(file))
            enqueue(resolved)
          } catch {
            // ignore
          }
        }
        continue
      }
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('file:')) {
        try {
          const resolved = Bun.resolveSync(spec, dirname(file))
          enqueue(resolved)
        } catch {
          // ignore
        }
        continue
      }
      const aliased = aliases?.[spec]
      if (aliased) enqueue(aliased)
    }
  }

  return specs
}

function computeHash(specs: Array<string>, root: string): string {
  const h = createHash('sha256')
  h.update(specs.join('\0'))
  try {
    h.update(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch {
    // ignore
  }
  for (const lockName of ['bun.lock', 'package-lock.json', 'pnpm-lock.yaml'] as const) {
    try {
      h.update(readFileSync(join(root, lockName), 'utf8').slice(0, 64_000))
      break
    } catch {
      // try next
    }
  }
  try {
    h.update(readFileSync(join(root, 'bun.lockb')).subarray(0, 64_000))
  } catch {
    // optional binary lock
  }
  return h.digest('hex').slice(0, 16)
}

function emptyResult(depsDir: string): OptimizeDepsResult {
  return {
    depsDir,
    urlForSpec: () => undefined,
    resolvePath: () => null,
    count: 0,
  }
}

function makeResult(
  depsDir: string,
  fileMap: Map<string, string>,
): OptimizeDepsResult {
  const urls = new Map<string, string>()
  for (const [spec, fileName] of fileMap) {
    urls.set(spec, `${DEPS_PREFIX}/${fileName}`)
  }
  return {
    depsDir,
    count: urls.size,
    urlForSpec: (spec) => urls.get(spec),
    resolvePath: (pathname) => {
      if (!pathname.startsWith(`${DEPS_PREFIX}/`)) return null
      const name = pathname.slice(DEPS_PREFIX.length + 1)
      if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
        return null
      }
      const abs = join(depsDir, name)
      return existsSync(abs) ? abs : null
    },
  }
}

/** Rewrite bare externals inside a prebundle to relative `./other.js` deps. */
function rewriteBareToRelativeDeps(
  code: string,
  fileMap: Map<string, string>,
  selfSpec: string,
): string {
  return code.replace(IMPORT_SPEC_RE, (full, g1, g2, g3, g4, g5, g6) => {
    const spec = (g3 ?? g6) as string
    const quote = (g2 ?? g5) as string
    const prefix = (g1 ?? g4) as string
    if (!isBareSpecifier(spec) || spec === selfSpec) return full
    const target = fileMap.get(spec)
    if (!target) return full
    return `${prefix}${quote}./${target}${quote}`
  })
}

/**
 * Prebundle discovered bare imports for ESM-dev.
 */
export async function runOptimizeDeps(opts: {
  root: string
  clientEntryPath: string
  aliases?: Record<string, string>
  optimizeDeps?: OptimizeDepsConfig | false
}): Promise<OptimizeDepsResult> {
  const config =
    opts.optimizeDeps === false
      ? ({ disabled: true } satisfies OptimizeDepsConfig)
      : (opts.optimizeDeps ?? {})
  const depsDir = join(opts.root, DEPS_CACHE_DIR)

  if (config.disabled) {
    return emptyResult(depsDir)
  }

  const exclude = [...DEFAULT_EXCLUDE_PREFIXES, ...(config.exclude ?? [])]
  const discovered = await scanAppBareImports(
    opts.root,
    opts.clientEntryPath,
    opts.aliases,
  )
  for (const s of config.include ?? []) discovered.add(s)
  for (const s of OPTIMIZE_DEPS_REACT_EXTERNALS) {
    if (s !== 'react-dom/server') discovered.add(s)
  }

  const specs = [...discovered].filter((s) => !isExcluded(s, exclude)).sort()
  if (specs.length === 0) {
    return emptyResult(depsDir)
  }

  const hash = computeHash(specs, opts.root)
  const metaPath = join(depsDir, '_metadata.json')
  const force =
    config.force === true ||
    process.env.TANSTACK_START_OPTIMIZE_DEPS_FORCE === '1'

  if (!force && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Metadata
      if (meta.hash === hash && meta.map && Object.keys(meta.map).length > 0) {
        const fileMap = new Map(Object.entries(meta.map))
        console.info(
          `[tanstack-start-bun] optimizeDeps: cache hit (${fileMap.size} entries)`,
        )
        return makeResult(depsDir, fileMap)
      }
    } catch {
      // rebuild
    }
  }

  const started = Date.now()
  rmSync(depsDir, { recursive: true, force: true })
  mkdirSync(depsDir, { recursive: true })

  const resolvedEntries: Array<{ spec: string; abs: string }> = []
  for (const spec of specs) {
    try {
      const abs = Bun.resolveSync(spec, opts.root)
      const n = abs.replace(/\\/g, '/')
      if (!n.includes('/node_modules/') && !n.includes('/.bun/')) continue
      const pkg = packageRootFromResolved(abs)
      if (pkg && isExcluded(pkg, exclude)) continue
      resolvedEntries.push({ spec, abs })
    } catch {
      // unresolved optional peer
    }
  }

  resolvedEntries.sort((a, b) => {
    const ar = isReactFamily(a.spec) ? 0 : 1
    const br = isReactFamily(b.spec) ? 0 : 1
    return ar - br || a.spec.localeCompare(b.spec)
  })

  const fileMap = new Map<string, string>()
  const failures: Array<string> = []

  for (const { spec, abs } of resolvedEntries) {
    const fileName = depsFileName(spec)
    const outfile = join(depsDir, fileName)
    const wrapperPath = join(depsDir, `.entry-${fileName}`)
    // Re-export wrapper: bundling package exports that contain `import "client-only"`
    // as the entrypoint can yield an empty/broken graph in Bun.build.
    writeFileSync(
      wrapperPath,
      [
        `export * from ${JSON.stringify(abs)};`,
        `import * as __m from ${JSON.stringify(abs)};`,
        `export default __m.default ?? __m;`,
        '',
      ].join('\n'),
    )
    const external = isReactFamily(spec)
      ? []
      : [...OPTIMIZE_DEPS_REACT_EXTERNALS]
    try {
      const built = await Bun.build({
        entrypoints: [wrapperPath],
        target: 'browser',
        format: 'esm',
        minify: false,
        packages: 'bundle',
        write: false,
        external,
      } as never)
      try {
        rmSync(wrapperPath, { force: true })
      } catch {
        // ignore
      }
      if (!built.success || !built.outputs[0]) {
        failures.push(spec)
        continue
      }
      let code = await built.outputs[0].text()
      if (/\b__require\s*\(/.test(code)) {
        failures.push(spec)
        try {
          rmSync(outfile, { force: true })
        } catch {
          // ignore
        }
        continue
      }
      // Broken Bun stubs from `client-only` package entries (mangled exports, no body)
      if (
        /\$[A-Za-z0-9]+\$export\$/.test(code) &&
        !/\bfunction\b/.test(code) &&
        code.length < 4000
      ) {
        failures.push(spec)
        try {
          rmSync(outfile, { force: true })
        } catch {
          // ignore
        }
        continue
      }
      fileMap.set(spec, fileName)
      code = rewriteBareToRelativeDeps(code, fileMap, spec)
      writeFileSync(outfile, code)
    } catch (err) {
      try {
        rmSync(wrapperPath, { force: true })
      } catch {
        // ignore
      }
      failures.push(spec)
      console.warn(
        `[tanstack-start-bun] optimizeDeps: skip ${spec}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Second pass once the full map exists (react may land after first consumers)
  for (const [spec, fileName] of fileMap) {
    const outfile = join(depsDir, fileName)
    try {
      const code = readFileSync(outfile, 'utf8')
      const next = rewriteBareToRelativeDeps(code, fileMap, spec)
      if (next !== code) writeFileSync(outfile, next)
    } catch {
      // ignore
    }
  }

  const meta: Metadata = {
    hash,
    map: Object.fromEntries(fileMap),
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  const ms = Date.now() - started
  console.info(
    `[tanstack-start-bun] optimizeDeps: ${fileMap.size} entries → ${relative(opts.root, depsDir)} (${ms}ms)` +
      (failures.length ? `; skipped ${failures.length}` : ''),
  )
  if (failures.length > 0 && failures.length <= 12) {
    console.info(
      `[tanstack-start-bun] optimizeDeps skipped: ${failures.join(', ')}`,
    )
  }

  return makeResult(depsDir, fileMap)
}
