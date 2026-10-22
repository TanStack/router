/**
 * The import gate: lists every import of a compiler-package internal in the
 * acceptance test files of the compiler oracle and in the helpers they use.
 *
 * The acceptance tests reach the compilers only through public entry points
 * (oracle/README.md, "Real tools and public entry points"). An internal is any module of a
 * compiler package that its `package.json` `exports` does not expose. These
 * are allowed:
 *
 * - the package specifier with an exported subpath
 *   (`@tanstack/router-plugin/vite`);
 * - a relative path to the source file an export maps to (`../src/vite`
 *   in router-plugin is `./vite`, built from `src/vite.ts`), or to an
 *   exported file itself;
 * - a type-only import of a public type through any path: the type is
 *   exported, under the same declaration, by a public entry. These are
 *   counted separately, so they can be moved to the public specifier.
 *
 * Everything else is a violation: a value import, re-export, dynamic
 * `import()`, `require`, `vi.mock`/`vi.importActual` or `typeof import()` of
 * an internal module, also when the symbol it reads is public (a moved
 * module breaks it all the same).
 *
 * The acceptance files are the files `test:unit` and `test:integration`
 * select (router-generator: also its `types` project's `*.test-d.ts`), outside
 * `outside-compiler-corpus/` (implementation lane) and outside the list in
 * the package's `tests/noncompiler-tests.json` (main's tests of features
 * that are not compilers, run by `test:noncompiler`). Their helpers are the modules they reach
 * through relative paths into a package's `tests/`, or into this package's
 * `src/` (also through `@tanstack/compiler-test-utils/*`), transitively.
 * Paths computed at run time (a `path.join` passed to `import()`) are out of
 * reach of a static gate.
 *
 * The only exceptions are the tests held by pending user rulings, listed in
 * `pendingRulingAllowlist` below: each entry names its ruling and goes away
 * when the ruling lands. A helper on that list is allowed only while no
 * other acceptance test reaches it, and an entry that matches nothing fails
 * strict mode (remove it).
 *
 * Run it through Nx (packages/compiler-test-utils/AGENTS.md):
 * `test:import-gate` reports and exits 0; `test:import-gate:strict` (or
 * `--strict`, or `COMPILER_IMPORT_GATE=strict`; CI runs it) exits 1 on any
 * violation the allowlist does not hold, on a stale allowlist entry, or on a
 * file it could not parse. `--json` prints the result as JSON.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'vite'

/** The compiler packages whose internals acceptance tests must not import. */
export const compilerPackages = [
  '@tanstack/router-generator',
  '@tanstack/router-plugin',
  '@tanstack/start-plugin-core',
  '@tanstack/react-start-rsc',
  '@tanstack/router-utils',
] as const

/** The packages whose `test:unit`/`test:integration` decide acceptance. */
export const acceptancePackages = [
  { dir: 'packages/compiler-test-utils', typeTests: false },
  // `types` project of `test:unit`: the route trees' `*.test-d.ts`.
  { dir: 'packages/router-generator', typeTests: true },
  { dir: 'packages/router-plugin', typeTests: false },
  { dir: 'packages/start-plugin-core', typeTests: false },
  // Its runtime tests and test-d files are main's (noncompiler-tests.json).
  { dir: 'packages/react-start-rsc', typeTests: false },
] as const

const helperPackage = '@tanstack/compiler-test-utils'

/**
 * Internal imports held by a pending user ruling (REPAIR/BRIEF, "Do NOT
 * touch: pending user rulings"). Every other internal import fails strict
 * mode.
 */
export interface PendingRulingAllowance {
  /** The ruling that holds the import (`Q5`, ...). */
  ruling: string
  /** The importing file, relative to the workspace root. */
  file: string
  /** The internal requests the file may import, as written. */
  requests: Array<string>
  /**
   * The acceptance files that may reach this file (a helper). A helper is
   * allowed only while no other acceptance file reaches it. Leave it out
   * for an acceptance test.
   */
  reachedOnlyBy?: Array<string>
  /** Why the ruling holds it, and what to do when it lands. */
  why: string
}

const startPendingRulings = [
  'packages/start-plugin-core/tests/pending-rulings/createMiddleware.test.ts',
  'packages/start-plugin-core/tests/pending-rulings/createServerFn.test.ts',
  'packages/start-plugin-core/tests/pending-rulings/known-bugs-start-compiler.test.ts',
]

/**
 * The allowlist of strict mode. Remove an entry when its ruling lands: the
 * test is rerouted through a public entry point, moved out of the corpus,
 * or deleted, and the entry would then match nothing (a stale entry fails
 * strict mode).
 */
export const pendingRulingAllowlist: ReadonlyArray<PendingRulingAllowance> = [
  {
    ruling: 'Q5',
    file: 'packages/router-plugin/tests/handle-route-update.test.ts',
    requests: [
      '../src/core/code-splitter/plugins/framework-plugins',
      '../src/core/hmr',
    ],
    why: 'the absent-live-route updater control calls the emitted handleRouteUpdate directly; remove when Q5 (is that state reachable through real tools?) is ruled',
  },
  {
    ruling: 'Q6',
    file: 'packages/start-plugin-core/tests/pending-rulings/createServerFn.test.ts',
    requests: [
      '../../src/start-compiler/compiler',
      '../../src/start-compiler/types',
    ],
    why: 'the createServerFn :293 internal-package-graph row drives StartCompiler; remove when Q6 is ruled',
  },
  {
    ruling: 'Q6',
    file: 'packages/start-plugin-core/tests/pending-rulings/createMiddleware.test.ts',
    requests: ['../../src/start-compiler/compiler'],
    why: 'the createMiddleware :75/:145 internal-package-graph rows drive StartCompiler; remove when Q6 is ruled',
  },
  ...(
    [
      ['diagnostics.ts', ['../../../src/start-compiler/types']],
      [
        'regression-helpers.ts',
        [
          '../../../src/start-compiler/compiler',
          '../../../src/start-compiler/config',
          '../../../src/start-compiler/types',
          '../../../src/types',
        ],
      ],
      [
        'render.ts',
        [
          '../../../src/hydrate-when-transform',
          '../../../src/start-compiler/host',
          '../../../src/types',
        ],
      ],
    ] as const
  ).map(
    ([helper, requests]): PendingRulingAllowance => ({
      ruling: 'Q6, Q7',
      file: `packages/start-plugin-core/tests/outside-compiler-corpus/legacy/${helper}`,
      requests: [...requests],
      reachedOnlyBy: startPendingRulings,
      why: 'legacy StartCompiler harness reached only by the pending-rulings files (Q6 rows, the Q7 CommonJS pin); remove with them when Q6 and Q7 are ruled, and delete tests/start-runtime.ts with it (FINAL-PASS #55)',
    }),
  ),
]

type ReferenceKind =
  | 'import'
  | 'export from'
  | 'import()'
  | 'typeof import()'
  | 'require'
  | 'require.resolve'
  | 'import.meta.resolve'
  | `vi.${string}`

interface Reference {
  request: string
  kind: ReferenceKind
  line: number
  typeOnly: boolean
  /** The names read, or `undefined` for the whole module. */
  names?: Array<string>
}

interface ExportEntry {
  /** `undefined` for `export * from`. */
  exportName?: string
  request?: string
  /** The name read from `request`: `*` for a namespace. */
  importName?: string
  localName?: string
}

interface ModuleInfo {
  references: Array<Reference>
  imports: Map<string, { request: string; importName: string }>
  exports: Array<ExportEntry>
  parseError?: string
}

interface CompilerPackage {
  name: string
  dir: string
  /** Exported subpaths (`.`, `./vite`), possibly with one `*`. */
  subpaths: Array<string>
  /** Files an export maps to, and the source files they are built from. */
  publicFiles: Set<string>
  publicSources: Array<string>
}

export interface Violation {
  /** Importing file, relative to the root. */
  file: string
  line: number
  kind: ReferenceKind
  request: string
  typeOnly: boolean
  names?: Array<string>
  package: string
  /** Resolved internal module, relative to the root (when it resolves). */
  target?: string
  reason: string
}

export interface ImportGateResult {
  root: string
  acceptanceFiles: Array<string>
  helperFiles: Array<string>
  violations: Array<Violation>
  /** Type-only imports of public types through an internal path (allowed). */
  publicTypesByPath: Array<Violation>
  /** Scanned files that did not parse (their imports are unchecked). */
  parseErrors: Array<{ file: string; message: string }>
  /** For each helper, the acceptance files that reach it. */
  usersOf: Record<string, Array<string>>
  /** Internal imports an allowlist entry holds (not in `violations`). */
  allowed: Array<Violation & { ruling: string }>
  /** Allowlist entries (one per request) that matched no import. */
  staleAllowances: Array<{ ruling: string; file: string; request: string }>
}

export interface ImportGateOptions {
  /** Workspace root (holds `packages/`). */
  root: string
  /** File contents by absolute path, read instead of the disk (controls). */
  files?: Record<string, string>
  /**
   * Internal imports held by pending rulings (the CLI passes
   * `pendingRulingAllowlist`). Default: none.
   */
  allowlist?: ReadonlyArray<PendingRulingAllowance>
}

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs']
const scriptPattern = /\.[cm]?[jt]sx?$/
const testPattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const typeTestPattern = /\.(?:test|spec)-d\.[cm]?[jt]sx?$/

export function findImportViolations(
  options: ImportGateOptions,
): ImportGateResult {
  const root = path.resolve(options.root)
  const virtual = new Map(
    Object.entries(options.files ?? {}).map(([file, code]) => [
      path.resolve(file),
      code,
    ]),
  )

  const isFile = (file: string) => {
    if (virtual.has(file)) {
      return true
    }
    try {
      return statSync(file).isFile()
    } catch {
      return false
    }
  }
  const read = (file: string) => virtual.get(file) ?? readFileSync(file, 'utf8')
  const relative = (file: string) =>
    path.relative(root, file).split(path.sep).join('/')

  const packageJson = (dir: string) =>
    JSON.parse(read(path.join(root, dir, 'package.json'))) as {
      name: string
      exports?: unknown
    }

  // Compiler packages by name, with their public files.
  const packageDirs = readdirSync(path.join(root, 'packages')).map((dir) =>
    path.join('packages', dir),
  )
  const compilers = new Map<string, CompilerPackage>()
  let helperExports: Record<string, string> = {}
  for (const dir of packageDirs) {
    if (!isFile(path.join(root, dir, 'package.json'))) {
      continue
    }
    const json = packageJson(dir)
    if (json.name === helperPackage) {
      helperExports = (json.exports ?? {}) as Record<string, string>
    }
    if (!(compilerPackages as ReadonlyArray<string>).includes(json.name)) {
      continue
    }
    const absoluteDir = path.join(root, dir)
    const exportsMap =
      typeof json.exports === 'object' && json.exports !== null
        ? (json.exports as Record<string, unknown>)
        : {}
    const publicFiles = new Set<string>()
    const publicSources: Array<string> = []
    for (const target of Object.values(exportsMap).flatMap(leaves)) {
      const file = path.join(absoluteDir, target)
      publicFiles.add(file)
      // `./dist/esm/vite.js`, `./dist/esm/src/plugin/vite.d.ts`: built from
      // `src/vite.ts`, `src/plugin/vite.ts`.
      const built =
        /^\.\/dist\/(?:esm|cjs)\/(?:src\/)?(.+?)\.(?:d\.[cm]?ts|[cm]?js)$/.exec(
          target,
        )
      if (built) {
        for (const extension of ['.ts', '.tsx', '.mts']) {
          const source = path.join(absoluteDir, 'src', built[1] + extension)
          if (isFile(source) && !publicFiles.has(source)) {
            publicFiles.add(source)
            publicSources.push(source)
          }
        }
      }
    }
    compilers.set(json.name, {
      name: json.name,
      dir: absoluteDir + path.sep,
      subpaths: Object.keys(exportsMap),
      publicFiles,
      publicSources,
    })
  }

  // Parsed modules.
  const modules = new Map<string, ModuleInfo>()
  const moduleInfo = (file: string): ModuleInfo => {
    let info = modules.get(file)
    if (!info) {
      info = analyze(file, read(file))
      modules.set(file, info)
    }
    return info
  }

  const resolveRelative = (from: string, request: string) => {
    const bare = request.replace(/[?#].*$/, '')
    const base = path.resolve(path.dirname(from), bare)
    const candidates = [base]
    const swapped = /\.([cm]?)js(x?)$/.exec(base)
    if (swapped) {
      const stem = base.slice(0, -swapped[0].length)
      candidates.push(`${stem}.${swapped[1]}ts${swapped[2]}`)
    }
    for (const extension of sourceExtensions) {
      candidates.push(base + extension)
    }
    for (const extension of sourceExtensions) {
      candidates.push(path.join(base, 'index' + extension))
    }
    return candidates.find(isFile)
  }

  const isRelative = (request: string) =>
    request.startsWith('./') ||
    request.startsWith('../') ||
    request === '.' ||
    request === '..' ||
    path.isAbsolute(request)

  const compilerOf = (file: string) =>
    [...compilers.values()].find((pkg) => file.startsWith(pkg.dir))

  const testsRoot = (file: string) => {
    const parts = path.relative(root, file).split(path.sep)
    return parts[0] === 'packages' && parts[2] === 'tests'
  }
  const helperRoot = path.join(root, 'packages', 'compiler-test-utils', 'src')
  const isHelper = (file: string) =>
    scriptPattern.test(file) &&
    !file.endsWith('.d.ts') &&
    (testsRoot(file) || file.startsWith(helperRoot + path.sep))

  /** Where an export of `file` is declared: `file#name`. */
  const originOf = (
    file: string,
    name: string,
    seen = new Set<string>(),
  ): string | undefined => {
    const key = `${file}#${name}`
    if (seen.has(key)) {
      return undefined
    }
    seen.add(key)
    const info = moduleInfo(file)
    const follow = (request: string, importName: string) => {
      const target = isRelative(request)
        ? resolveRelative(file, request)
        : undefined
      if (!target) {
        return `${request}#${importName}`
      }
      return importName === '*'
        ? `${target}#*`
        : originOf(target, importName, seen)
    }
    for (const entry of info.exports) {
      if (entry.exportName !== name) {
        continue
      }
      if (entry.request !== undefined) {
        return follow(entry.request, entry.importName ?? name)
      }
      const imported = entry.localName
        ? info.imports.get(entry.localName)
        : undefined
      if (imported) {
        return follow(imported.request, imported.importName)
      }
      return `${file}#${entry.localName ?? name}`
    }
    if (name !== 'default') {
      for (const entry of info.exports) {
        if (entry.exportName === undefined && entry.request !== undefined) {
          const target = isRelative(entry.request)
            ? resolveRelative(file, entry.request)
            : undefined
          const origin = target ? originOf(target, name, seen) : undefined
          if (origin) {
            return origin
          }
        }
      }
    }
    return undefined
  }

  const isPublicType = (pkg: CompilerPackage, file: string, name: string) => {
    const origin = originOf(file, name)
    return (
      origin !== undefined &&
      pkg.publicSources.some((entry) => originOf(entry, name) === origin)
    )
  }

  // Acceptance files.
  const acceptanceFiles: Array<string> = []
  for (const { dir, typeTests } of acceptancePackages) {
    const testsDir = path.join(root, dir, 'tests')
    const noncompiler = new Set(
      noncompilerTestsOf(testsDir, isFile, read).map((entry) =>
        path.join(testsDir, entry),
      ),
    )
    const candidates = new Set([
      ...walk(testsDir),
      ...[...virtual.keys()].filter((file) =>
        file.startsWith(testsDir + path.sep),
      ),
    ])
    for (const file of candidates) {
      const rel = path.relative(testsDir, file).split(path.sep)
      if (
        rel.includes('outside-compiler-corpus') ||
        rel.includes('node_modules') ||
        noncompiler.has(file)
      ) {
        continue
      }
      if (testPattern.test(file) || (typeTests && typeTestPattern.test(file))) {
        acceptanceFiles.push(file)
      }
    }
  }
  acceptanceFiles.sort()

  const violations: Array<Violation> = []
  const publicTypesByPath: Array<Violation> = []
  const parseErrors: Array<{ file: string; message: string }> = []
  const edges = new Map<string, Array<string>>()

  const check = (file: string) => {
    const info = moduleInfo(file)
    if (info.parseError !== undefined) {
      parseErrors.push({ file: relative(file), message: info.parseError })
    }
    const next: Array<string> = []
    for (const reference of info.references) {
      const { request } = reference
      const violation = (
        pkg: CompilerPackage,
        reason: string,
        target?: string,
      ): Violation => ({
        file: relative(file),
        line: reference.line,
        kind: reference.kind,
        request,
        typeOnly: reference.typeOnly,
        ...(reference.names ? { names: reference.names } : {}),
        package: pkg.name,
        ...(target ? { target: relative(target) } : {}),
        reason,
      })

      if (isRelative(request)) {
        const target = resolveRelative(file, request)
        const absolute =
          target ??
          path.resolve(path.dirname(file), request.replace(/[?#].*$/, ''))
        if (target && isHelper(target)) {
          next.push(target)
          continue
        }
        const pkg = testsRoot(absolute) ? undefined : compilerOf(absolute)
        if (!pkg) {
          continue
        }
        if (target && pkg.publicFiles.has(target)) {
          continue
        }
        const where = target
          ? relative(target).slice(relative(pkg.dir).length + 1)
          : request
        if (
          target &&
          reference.typeOnly &&
          reference.names?.length &&
          reference.names.every((name) => isPublicType(pkg, target, name))
        ) {
          publicTypesByPath.push(
            violation(
              pkg,
              `public type through the internal path ${where}; import it from '${pkg.name}'`,
              target,
            ),
          )
          continue
        }
        violations.push(
          violation(
            pkg,
            target
              ? `${where} is not a public entry of ${pkg.name}`
              : `${request} does not resolve; it points into ${pkg.name}`,
            target,
          ),
        )
        continue
      }

      // Package specifiers.
      if (
        request === helperPackage ||
        request.startsWith(helperPackage + '/')
      ) {
        const subpath = '.' + request.slice(helperPackage.length)
        const target = helperExports[subpath]
        if (typeof target === 'string') {
          const file = path.join(
            root,
            'packages',
            'compiler-test-utils',
            target,
          )
          if (isHelper(file) && isFile(file)) {
            next.push(file)
          }
        }
        continue
      }
      const pkg = [...compilers.values()].find(
        (candidate) =>
          request === candidate.name ||
          request.startsWith(candidate.name + '/'),
      )
      if (!pkg) {
        continue
      }
      const subpath = '.' + request.slice(pkg.name.length)
      if (pkg.subpaths.some((key) => matchesSubpath(key, subpath))) {
        continue
      }
      violations.push(
        violation(pkg, `${subpath} is not in the exports of ${pkg.name}`),
      )
    }
    edges.set(file, [...new Set(next)])
    return next
  }

  // Every file reachable from the acceptance files, once.
  const queue = [...acceptanceFiles]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file)) {
      continue
    }
    visited.add(file)
    queue.push(...check(file))
  }

  const acceptance = new Set(acceptanceFiles)
  const helperFiles = [...visited].filter((file) => !acceptance.has(file))

  // Which acceptance files reach each helper.
  const usersOf: Record<string, Array<string>> = {}
  for (const test of acceptanceFiles) {
    const seen = new Set<string>()
    const stack = [...(edges.get(test) ?? [])]
    while (stack.length > 0) {
      const file = stack.pop()!
      if (seen.has(file) || acceptance.has(file)) {
        continue
      }
      seen.add(file)
      stack.push(...(edges.get(file) ?? []))
    }
    for (const helper of seen) {
      ;(usersOf[relative(helper)] ??= []).push(relative(test))
    }
  }

  // The pending rulings' allowlist.
  const allowlist = options.allowlist ?? []
  const allowed: ImportGateResult['allowed'] = []
  const used = new Set<string>()
  const remaining = violations.filter((violation) => {
    const entry = allowlist.find(
      (candidate) =>
        candidate.file === violation.file &&
        candidate.requests.includes(violation.request),
    )
    if (!entry) {
      return true
    }
    used.add(`${entry.file}\0${violation.request}`)
    const others = entry.reachedOnlyBy
      ? (usersOf[violation.file] ?? []).filter(
          (user) => !entry.reachedOnlyBy!.includes(user),
        )
      : []
    if (others.length > 0) {
      violation.reason += ` (allowlisted for ${entry.ruling} only while reached by its tests, but also reached by ${others.join(', ')})`
      return true
    }
    allowed.push({ ...violation, ruling: entry.ruling })
    return false
  })
  const staleAllowances = allowlist.flatMap((entry) =>
    entry.requests
      .filter((request) => !used.has(`${entry.file}\0${request}`))
      .map((request) => ({ ruling: entry.ruling, file: entry.file, request })),
  )

  const byLocation = (a: Violation, b: Violation) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  return {
    root,
    acceptanceFiles: acceptanceFiles.map(relative),
    helperFiles: helperFiles.map(relative).sort(),
    violations: remaining.sort(byLocation),
    publicTypesByPath: publicTypesByPath.sort(byLocation),
    parseErrors,
    usersOf,
    allowed: allowed.sort(byLocation),
    staleAllowances,
  }
}

/** Whether strict mode fails: what it fails on, empty when it passes. */
export function strictFailures(result: ImportGateResult): Array<string> {
  return [
    ...result.violations.map(
      (violation) =>
        `${violation.file}:${violation.line} imports ${violation.request}`,
    ),
    ...result.staleAllowances.map(
      (entry) =>
        `stale allowlist entry (${entry.ruling}): ${entry.file} no longer imports ${entry.request}; remove it`,
    ),
    ...result.parseErrors.map((error) => `${error.file} did not parse`),
  ]
}

/** The file paths of an `exports` value (all conditions). */
function leaves(value: unknown): Array<string> {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(leaves)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(leaves)
  }
  return []
}

function matchesSubpath(key: string, subpath: string) {
  const star = key.indexOf('*')
  if (star === -1) {
    return key === subpath
  }
  return (
    subpath.startsWith(key.slice(0, star)) &&
    subpath.endsWith(key.slice(star + 1)) &&
    subpath.length >= key.length - 1
  )
}

/**
 * The list in a package's `tests/noncompiler-tests.json` (paths relative to
 * its `tests/`): main's tests of features that are not compilers, which its
 * `noncompiler` Vitest project selects and the corpus projects exclude.
 */
function noncompilerTestsOf(
  testsDir: string,
  isFile: (file: string) => boolean,
  read: (file: string) => string,
): Array<string> {
  const list = path.join(testsDir, 'noncompiler-tests.json')
  return isFile(list) ? (JSON.parse(read(list)) as Array<string>) : []
}

function walk(dir: string): Array<string> {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : walk(file)
    }
    return entry.isFile() ? [file] : []
  })
}

function analyze(file: string, code: string): ModuleInfo {
  const info: ModuleInfo = { references: [], imports: new Map(), exports: [] }
  const lang = /\.tsx$/.test(file)
    ? 'tsx'
    : /\.[cm]?ts$/.test(file)
      ? 'ts'
      : 'jsx'
  let result
  try {
    result = parseSync(file, code, { lang, sourceType: 'module' })
  } catch (error) {
    info.parseError = String(error)
    return info
  }
  if (result.errors.length > 0) {
    info.parseError = result.errors.map((error) => error.message).join('; ')
  }

  const lineStarts = [0]
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '\n') {
      lineStarts.push(index + 1)
    }
  }
  const lineOf = (offset: number) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (lineStarts[middle]! <= offset) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return low + 1
  }

  for (const statement of result.module.staticImports) {
    const request = statement.moduleRequest.value
    const names: Array<string> = []
    let whole = statement.entries.length === 0
    for (const entry of statement.entries) {
      const { importName } = entry
      const name =
        importName.kind === 'NamespaceObject'
          ? '*'
          : importName.kind === 'Default'
            ? 'default'
            : (importName.name ?? 'default')
      info.imports.set(entry.localName.value, { request, importName: name })
      if (name === '*') {
        whole = true
      } else {
        names.push(name)
      }
    }
    info.references.push({
      request,
      kind: 'import',
      line: lineOf(statement.start),
      typeOnly:
        statement.entries.length > 0 &&
        statement.entries.every((entry) => entry.isType),
      ...(whole ? {} : { names }),
    })
  }

  for (const statement of result.module.staticExports) {
    const fromRequests = new Map<string, Reference>()
    for (const entry of statement.entries) {
      const exportName =
        entry.exportName.kind === 'Default'
          ? 'default'
          : (entry.exportName.name ?? undefined)
      const request = entry.moduleRequest?.value
      const importName =
        entry.importName.kind === 'Name'
          ? (entry.importName.name ?? undefined)
          : entry.importName.kind === 'All'
            ? '*'
            : undefined
      const localName =
        entry.localName.kind === 'Name' || entry.localName.kind === 'Default'
          ? (entry.localName.name ?? undefined)
          : undefined
      info.exports.push({
        ...(exportName !== undefined ? { exportName } : {}),
        ...(request !== undefined ? { request } : {}),
        ...(importName !== undefined ? { importName } : {}),
        ...(localName !== undefined ? { localName } : {}),
      })
      if (request === undefined) {
        continue
      }
      let reference = fromRequests.get(request)
      if (!reference) {
        reference = {
          request,
          kind: 'export from',
          line: lineOf(statement.start),
          typeOnly: true,
          names: [],
        }
        fromRequests.set(request, reference)
        info.references.push(reference)
      }
      reference.typeOnly &&= entry.isType
      if (importName === undefined || importName === '*') {
        delete reference.names
      } else {
        reference.names?.push(importName)
      }
    }
  }

  // Dynamic forms: `import()`, `typeof import()`, `require`, `vi.mock`, ...
  const literal = (node: unknown): string | undefined => {
    if (!isNode(node)) {
      return undefined
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
      return node.value
    }
    if (
      node.type === 'TemplateLiteral' &&
      Array.isArray(node.expressions) &&
      node.expressions.length === 0 &&
      Array.isArray(node.quasis)
    ) {
      const quasi: unknown = node.quasis[0]
      if (isNode(quasi) && isNode(quasi.value)) {
        const cooked = quasi.value.cooked
        return typeof cooked === 'string' ? cooked : undefined
      }
    }
    return undefined
  }
  const nameOf = (node: unknown): string | undefined => {
    if (!isNode(node)) {
      return undefined
    }
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      return node.name
    }
    if (node.type === 'MemberExpression' && !node.computed) {
      const object =
        isNode(node.object) && node.object.type === 'MetaProperty'
          ? 'import.meta'
          : nameOf(node.object)
      const property = nameOf(node.property)
      return object && property ? `${object}.${property}` : undefined
    }
    return undefined
  }
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isNode(node)) {
      return
    }
    const start = typeof node.start === 'number' ? node.start : 0
    if (node.type === 'ImportExpression') {
      const request = literal(node.source)
      if (request !== undefined) {
        info.references.push({
          request,
          kind: 'import()',
          line: lineOf(start),
          typeOnly: false,
        })
      }
    } else if (node.type === 'TSImportType') {
      const request = literal(node.source) ?? literal(node.argument)
      const qualifier = isNode(node.qualifier)
        ? nameOf(node.qualifier)
        : undefined
      if (request !== undefined) {
        info.references.push({
          request,
          kind: 'typeof import()',
          line: lineOf(start),
          typeOnly: true,
          ...(qualifier && !qualifier.includes('.')
            ? { names: [qualifier] }
            : {}),
        })
      }
    } else if (
      node.type === 'CallExpression' &&
      Array.isArray(node.arguments)
    ) {
      const callee = nameOf(node.callee)
      const request = literal(node.arguments[0])
      const kind =
        callee === 'require' ||
        callee === 'require.resolve' ||
        callee === 'import.meta.resolve'
          ? callee
          : callee &&
              /^vi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)$/.test(
                callee,
              )
            ? (callee as `vi.${string}`)
            : undefined
      if (kind && request !== undefined) {
        info.references.push({
          request,
          kind,
          line: lineOf(start),
          typeOnly: false,
        })
      }
    }
    for (const key of Object.keys(node)) {
      if (key !== 'type' && key !== 'start' && key !== 'end') {
        visit(node[key])
      }
    }
  }
  visit(result.program)
  return info
}

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text report: violations grouped by importing file. */
export function formatImportGateReport(
  result: ImportGateResult,
  mode: 'report' | 'strict',
): string {
  const lines: Array<string> = []
  const byFile = new Map<string, Array<Violation>>()
  for (const violation of result.violations) {
    const list = byFile.get(violation.file) ?? []
    list.push(violation)
    byFile.set(violation.file, list)
  }
  const acceptance = new Set(result.acceptanceFiles)
  const describe = (violation: Violation) => {
    const names = violation.names?.length
      ? ` { ${violation.names.join(', ')} }`
      : ''
    const type = violation.typeOnly ? ' (type-only)' : ''
    return `  ${violation.line}: ${violation.kind}${names} '${violation.request}'${type}: ${violation.reason}`
  }

  // Acceptance files reached by a violation, directly or through a helper.
  const affected = new Set<string>()
  for (const file of byFile.keys()) {
    if (acceptance.has(file)) {
      affected.add(file)
    }
    for (const user of result.usersOf[file] ?? []) {
      affected.add(user)
    }
  }

  lines.push(
    `Compiler import gate (${mode} mode). Scanned ${result.acceptanceFiles.length} acceptance test files and ${result.helperFiles.length} helper files.`,
    '',
  )
  for (const [file, list] of byFile) {
    const role = acceptance.has(file)
      ? 'acceptance test'
      : `helper, reached by ${result.usersOf[file]?.length ?? 0} acceptance test files`
    lines.push(`${file} (${role})`, ...list.map(describe), '')
  }

  const byPackage = new Map<string, number>()
  for (const violation of result.violations) {
    byPackage.set(
      violation.package,
      (byPackage.get(violation.package) ?? 0) + 1,
    )
  }
  const helperFilesWithViolations = [...byFile.keys()].filter(
    (file) => !acceptance.has(file),
  ).length
  lines.push(
    `${result.violations.length} imports of compiler internals outside the pending rulings' allowlist, in ${byFile.size} files (${byFile.size - helperFilesWithViolations} acceptance test files, ${helperFilesWithViolations} helpers).`,
    `${affected.size} of ${result.acceptanceFiles.length} acceptance test files import an internal directly or through a helper.`,
    `By package: ${[...byPackage].map(([name, count]) => `${name} ${count}`).join(', ') || 'none'}.`,
  )
  if (result.publicTypesByPath.length > 0) {
    lines.push(
      '',
      `Allowed: ${result.publicTypesByPath.length} type-only imports of public types through an internal path (prefer the public specifier):`,
      ...result.publicTypesByPath.map(
        (entry) => `  ${entry.file}:${entry.line} '${entry.request}'`,
      ),
    )
  }
  if (result.parseErrors.length > 0) {
    lines.push(
      '',
      `${result.parseErrors.length} files did not parse; their imports are unchecked:`,
      ...result.parseErrors.map(
        (error) => `  ${error.file}: ${error.message.split('\n')[0]}`,
      ),
    )
  }
  if (result.allowed.length > 0) {
    lines.push(
      '',
      `Held by pending rulings (allowlist, remove each entry when its ruling lands): ${result.allowed.length} imports:`,
      ...result.allowed.map(
        (entry) =>
          `  ${entry.ruling}: ${entry.file}:${entry.line} '${entry.request}'`,
      ),
    )
  }
  if (result.staleAllowances.length > 0) {
    lines.push(
      '',
      `${result.staleAllowances.length} allowlist entries match no import; remove them:`,
      ...result.staleAllowances.map(
        (entry) => `  ${entry.ruling}: ${entry.file} '${entry.request}'`,
      ),
    )
  }
  if (mode === 'strict') {
    lines.push(
      '',
      strictFailures(result).length > 0
        ? "FAIL: acceptance tests and their helpers must reach the compilers through public entry points (only the pending rulings' allowlist is exempt, and it must be current)."
        : "OK: no acceptance test or helper imports a compiler internal outside the pending rulings' allowlist.",
    )
  }
  return lines.join('\n')
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const strict =
    process.argv.includes('--strict') ||
    process.env.COMPILER_IMPORT_GATE === 'strict'
  const result = findImportViolations({
    root: fileURLToPath(new URL('../../..', import.meta.url)),
    allowlist: pendingRulingAllowlist,
  })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatImportGateReport(result, strict ? 'strict' : 'report'))
  }
  if (strict && strictFailures(result).length > 0) {
    process.exitCode = 1
  }
}
