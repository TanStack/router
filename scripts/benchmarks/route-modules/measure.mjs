// Measures route modules against a single application with the same routes
// (CONCEPT.md §8): generation, declaration emit and type-check cost, the
// consumer program size, and incremental behaviour after an implementation
// change and after a contract change.
//
// Usage: node scripts/benchmarks/route-modules/measure.mjs [modules] [groups]
// Each module has `groups * 3 + 1` routes (static, search, param, index).
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const moduleCount = Number(process.argv[2] ?? 10)
const groups = Number(process.argv[3] ?? 10)

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')
// The router fixture resolves the generator and the runtime packages.
const fixture = path.join(repoRoot, 'e2e/react-router/route-modules')
const fixturePackage = path.join(fixture, 'packages/products')
const generatorEntry = createRequire(
  path.join(fixture, 'package.json'),
).resolve('@tanstack/router-generator')
const { Generator, getConfig } = await import(
  pathToFileURL(generatorEntry).href
)
const external = [
  '@tanstack/react-router',
  '@tanstack/router-core',
  'react',
  '@types/react',
]

const workspace = realpathSync(
  (() => {
    const dir = path.join(
      os.tmpdir(),
      `route-modules-measure-${crypto.randomBytes(4).toString('hex')}`,
    )
    mkdirSync(dir, { recursive: true })
    return dir
  })(),
)

const tsconfig = {
  compilerOptions: {
    strict: true,
    jsx: 'react-jsx',
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    lib: ['DOM', 'DOM.Iterable', 'ES2022'],
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
  include: ['src'],
}
const routeTypesTsconfig = {
  extends: './tsconfig.json',
  compilerOptions: {
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    noEmitOnError: true,
    declarationMap: true,
    rootDir: '.',
    outDir: '.tanstack/types',
  },
  include: ['src'],
}

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
  )
}

function writePackage(root, packageJson, dependencies) {
  write(path.join(root, 'package.json'), packageJson)
  write(path.join(root, 'tsconfig.json'), tsconfig)
  for (const dependency of external) {
    const link = path.join(root, 'node_modules', dependency)
    mkdirSync(path.dirname(link), { recursive: true })
    symlinkSync(
      realpathSync(path.join(fixturePackage, 'node_modules', dependency)),
      link,
      'dir',
    )
  }
  for (const [name, target] of dependencies) {
    const link = path.join(root, 'node_modules', name)
    mkdirSync(path.dirname(link), { recursive: true })
    symlinkSync(target, link, 'dir')
  }
}

const searchValidator = `(search: Record<string, unknown>) => ({
    page: Number(search.page ?? 0),
    q: String(search.q ?? ''),
  })`

/**
 * The routes of one feature. `api` names the routing APIs: module routes use
 * the scope and module-local paths, application routes use the framework and
 * prefixed paths. `other` addresses the previous feature.
 */
function featureRoutes({ id, prefix, scopeImport, otherLink }) {
  const files = {}
  const route = (file, routePath, body, extraImports = '') => {
    const depth = file.split('/').length - 1
    const scope = scopeImport(depth)
    files[file] = `${scope}${extraImports}
export const Route = createFileRoute('${id(routePath)}')(${body})
`
  }
  route(
    'index.tsx',
    '/',
    `{
  component: () => <Route.Link to="${prefix}/item0">First item</Route.Link>,
}`,
  )
  for (let i = 0; i < groups; i++) {
    const next = (i + 1) % groups
    route(
      `item${i}.tsx`,
      `/item${i}`,
      `{
  component: () => (
    <nav>
      <Route.Link to="${prefix}/item${next}">Next</Route.Link>
      ${otherLink(i)}
    </nav>
  ),
})`.replace(/\)$/, ''),
    )
    route(
      `search${i}.tsx`,
      `/search${i}`,
      `{
  validateSearch: ${searchValidator},
  loader: () => ({ results: [{ id: 'r${i}', score: ${i} }] }),
  component: () => {
    const { page, q } = Route.useSearch()
    const { results } = Route.useLoaderData()
    return (
      <Route.Link to="${prefix}/params${i}/$id" params={{ id: results[0]!.id }}>
        {q}:{page}
      </Route.Link>
    )
  },
}`,
    )
    route(
      `params${i}/$id.tsx`,
      `/params${i}/$id`,
      `{
  loader: ({ params }) => ({ id: params.id, label: 'item ' + params.id }),
  component: () => {
    const { label } = Route.useLoaderData()
    return (
      <Route.Link to="${prefix}/search${i}" search={{ page: 1, q: label }}>
        Back
      </Route.Link>
    )
  },
}`,
    )
  }
  return files
}

function moduleName(k) {
  return `@bench/m${k}`
}

/** A single application with every feature under `/f<k>`. */
function writeSingleApp(root) {
  writePackage(root, { name: '@bench/single', type: 'module' }, [])
  write(
    path.join(root, 'src/routes/__root.tsx'),
    `import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  )
  write(
    path.join(root, 'src/routes/index.tsx'),
    `import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <nav>
${Array.from({ length: moduleCount }, (_, k) => `      <Link to="/f${k}">Feature ${k}</Link>`).join('\n')}
    </nav>
  ),
})
`,
  )
  for (let k = 0; k < moduleCount; k++) {
    const files = featureRoutes({
      id: (routePath) => `/f${k}${routePath === '/' ? '/' : routePath}`,
      prefix: `/f${k}`,
      scopeImport: () =>
        `import { Link, createFileRoute } from '@tanstack/react-router'\n`,
      otherLink: (i) =>
        k > 0
          ? `<Link to="/f${k - 1}/search${i}" search={{ page: 1, q: 'x' }}>Other</Link>`
          : '',
    })
    for (const [file, content] of Object.entries(files)) {
      write(path.join(root, 'src/routes', `f${k}`, file), content)
    }
  }
}

/** The same features as route modules; module `k` uses module `k - 1`. */
function writeModules() {
  const roots = []
  for (let k = 0; k < moduleCount; k++) {
    const root = path.join(workspace, 'modular', `m${k}`)
    roots.push(root)
    const dependencies = k > 0 ? [[moduleName(k - 1), roots[k - 1]]] : []
    writePackage(
      root,
      {
        name: moduleName(k),
        type: 'module',
        tanstack: {
          router: { module: { uses: dependencies.map(([name]) => name) } },
        },
        exports: {
          './route-types': {
            types: './.tanstack/types/src/routeContract.gen.d.ts',
          },
          './route-module': {
            types: './.tanstack/types/src/routeModule.gen.d.ts',
            default: './src/routeModule.gen.ts',
          },
          './package.json': './package.json',
        },
        dependencies: Object.fromEntries(
          [...external, ...dependencies.map(([name]) => name)].map((name) => [
            name,
            '*',
          ]),
        ),
      },
      dependencies,
    )
    write(path.join(root, 'tsconfig.route-types.json'), routeTypesTsconfig)
    write(
      path.join(root, 'src/routes/__root.tsx'),
      `import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({ component: () => <Outlet /> })
`,
    )
    const files = featureRoutes({
      id: (routePath) => `${moduleName(k)}:${routePath}`,
      prefix: '',
      scopeImport: (depth) => {
        const scope = `${'../'.repeat(depth + 1)}routeScope.gen`
        return k > 0
          ? `import { createFileRoute, m${k - 1} } from '${scope}'\n`
          : `import { createFileRoute } from '${scope}'\n`
      },
      otherLink: (i) =>
        k > 0
          ? `<m${k - 1}.Link to="/search${i}" search={{ page: 1, q: 'x' }}>Other</m${k - 1}.Link>`
          : '',
    })
    for (const [file, content] of Object.entries(files)) {
      write(path.join(root, 'src/routes', file), content)
    }
  }

  const app = path.join(workspace, 'modular', 'app')
  writePackage(
    app,
    {
      name: '@bench/app',
      type: 'module',
      dependencies: Object.fromEntries(
        roots.map((_, k) => [moduleName(k), '*']),
      ),
    },
    roots.map((root, k) => [moduleName(k), root]),
  )
  write(
    path.join(app, 'src/routes/__root.tsx'),
    `import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  )
  write(
    path.join(app, 'src/routes/index.tsx'),
    `import { createFileRoute } from '@tanstack/react-router'
import { ${roots.map((_, k) => `m${k}`).join(', ')} } from '../routeScope.gen'

export const Route = createFileRoute('/')({
  component: () => (
    <nav>
${roots.map((_, k) => `      <m${k}.Link to="/">Feature ${k}</m${k}.Link>`).join('\n')}
    </nav>
  ),
})
`,
  )
  return { roots, app }
}

const appRouteModules = {
  includes: Array.from({ length: moduleCount }, (_, k) => ({
    module: moduleName(k),
    at: `/f${k}`,
  })),
}

async function generate(root, routeModules) {
  const config = getConfig(
    {
      disableLogging: true,
      tmpDir: path.join(workspace, '.tmp'),
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      ...(routeModules ? { routeModules } : {}),
    },
    root,
  )
  await new Generator({ config, root }).run()
}

async function timed(fn) {
  const start = performance.now()
  const result = await fn()
  return { ms: performance.now() - start, result }
}

/** `tsc --noEmit --extendedDiagnostics` in `root`. */
function typeCheck(root) {
  const start = performance.now()
  const result = spawnSync(
    tsc,
    ['-p', 'tsconfig.json', '--noEmit', '--extendedDiagnostics'],
    { cwd: root, encoding: 'utf8' },
  )
  const ms = performance.now() - start
  if (result.status !== 0) {
    throw new Error(`tsc failed in ${root}:\n${result.stdout}${result.stderr}`)
  }
  const metric = (name) => {
    const match = new RegExp(`^${name}:\\s+([\\d.,]+)`, 'm').exec(result.stdout)
    return match ? Number(match[1].replace(/,/g, '')) : undefined
  }
  const memory = /^Memory used:\s+([\d.,]+)K/m.exec(result.stdout)
  return {
    ms,
    files: metric('Files'),
    lines: metric('Lines'),
    types: metric('Types'),
    instantiations: metric('Instantiations'),
    memoryMB: memory
      ? Math.round(Number(memory[1].replace(/,/g, '')) / 1024)
      : undefined,
    checkSeconds: metric('Check time'),
  }
}

function declarationSnapshot(dir) {
  const declarations = new Map()
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else if (/\.d\.(?:ts|mts|cts)$/.test(full)) {
        declarations.set(path.relative(dir, full), readFileSync(full))
      }
    }
  }
  if (existsSync(dir)) {
    walk(dir)
  }
  return declarations
}

function declarationChanges(before, after) {
  let changed = 0
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(file)
    const current = after.get(file)
    if (!previous || !current || !previous.equals(current)) {
      changed++
    }
  }
  return changed
}

// The workload owns its declaration build just like an ordinary package does.
function emitTypes(root) {
  const outDir = path.join(root, routeTypesTsconfig.compilerOptions.outDir)
  rmSync(outDir, { recursive: true, force: true })
  const result = spawnSync(
    tsc,
    ['-p', 'tsconfig.route-types.json', '--pretty', 'false'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `Declaration build failed in ${root}:\n${result.stdout}${result.stderr}`,
    )
  }
}

function format(ms) {
  return `${(ms / 1000).toFixed(2)} s`
}

const routesPerFeature = groups * 3 + 1
const compilerVersion = spawnSync(tsc, ['--version'], { encoding: 'utf8' })
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
console.log(
  `Environment: Node ${process.version}; ${compilerVersion.stdout.trim()}; revision ${revision.status === 0 ? revision.stdout.trim() : 'unavailable'}`,
)
console.log(
  `Workload: ${moduleCount} features x ${routesPerFeature} routes = ${moduleCount * routesPerFeature} routes (+ app root and index)`,
)

// Single application.
const single = path.join(workspace, 'single')
writeSingleApp(single)
const singleGenerate = await timed(() => generate(single))
const singleCheck = typeCheck(single)

// Route modules, in dependency order, as a task runner would run them.
const { roots, app } = writeModules()
let modulesGenerateMs = 0
let modulesEmitMs = 0
for (const root of roots) {
  modulesGenerateMs += (await timed(() => generate(root))).ms
  const emitted = await timed(() => emitTypes(root))
  modulesEmitMs += emitted.ms
}
const appGenerate = await timed(() => generate(app, appRouteModules))
const appCheck = typeCheck(app)
const moduleChecks = roots.map((root) => typeCheck(root))
const declarations = roots
  .map((root) => {
    const files = declarationSnapshot(
      path.join(root, routeTypesTsconfig.compilerOptions.outDir),
    )
    return {
      files: files.size,
      bytes: [...files.values()].reduce(
        (sum, content) => sum + content.length,
        0,
      ),
    }
  })
  .reduce((a, b) => ({ files: a.files + b.files, bytes: a.bytes + b.bytes }))

// Incremental: an implementation-only change in the first module.
const first = roots[0]
const firstOutDir = path.join(first, routeTypesTsconfig.compilerOptions.outDir)
const coldDeclarations = declarationSnapshot(firstOutDir)
const itemFile = path.join(first, 'src/routes/item0.tsx')
writeFileSync(
  itemFile,
  readFileSync(itemFile, 'utf8').replace('>Next<', '>Next item<'),
)
const implementationEmit = await timed(() => emitTypes(first))
const implementationDeclarations = declarationSnapshot(firstOutDir)
const implementationChanges = declarationChanges(
  coldDeclarations,
  implementationDeclarations,
)

// Incremental: a contract change (a new optional search param) in the first
// module.
const searchFile = path.join(first, 'src/routes/search0.tsx')
writeFileSync(
  searchFile,
  readFileSync(searchFile, 'utf8').replace(
    "q: String(search.q ?? ''),",
    "q: String(search.q ?? ''),\n    ...(search.sort ? { sort: String(search.sort) } : {}),",
  ),
)
const contractGenerate = await timed(() => generate(first))
const contractEmit = await timed(() => emitTypes(first))
const contractChanges = declarationChanges(
  implementationDeclarations,
  declarationSnapshot(firstOutDir),
)
const dependentCheck = typeCheck(roots[1])
const contractAppCheck = typeCheck(app)

const rows = [
  [
    'Generate (cold)',
    format(singleGenerate.ms),
    `${format(modulesGenerateMs + appGenerate.ms)} (modules ${format(modulesGenerateMs)}, app ${format(appGenerate.ms)})`,
  ],
  ['Emit declarations (cold)', '-', format(modulesEmitMs)],
  ['Application type check', format(singleCheck.ms), format(appCheck.ms)],
  ['Application program files', singleCheck.files, appCheck.files],
  ['Application program lines', singleCheck.lines, appCheck.lines],
  ['Application types', singleCheck.types, appCheck.types],
  [
    'Application instantiations',
    singleCheck.instantiations,
    appCheck.instantiations,
  ],
  ['Application memory (MB)', singleCheck.memoryMB, appCheck.memoryMB],
  [
    'Module type checks (sum)',
    '-',
    format(moduleChecks.reduce((sum, check) => sum + check.ms, 0)),
  ],
  [
    'Largest module program files',
    '-',
    Math.max(...moduleChecks.map((check) => check.files ?? 0)),
  ],
  [
    'Declaration files / size',
    '-',
    `${declarations.files} / ${Math.round(declarations.bytes / 1024)} KiB`,
  ],
  [
    'Implementation change: emit',
    '-',
    `${format(implementationEmit.ms)}, ${implementationChanges} declarations changed`,
  ],
  [
    'Contract change: generate + emit',
    '-',
    `${format(contractGenerate.ms + contractEmit.ms)}, ${contractChanges} declarations changed`,
  ],
  ['Contract change: dependent module check', '-', format(dependentCheck.ms)],
  ['Contract change: application check', '-', format(contractAppCheck.ms)],
]

console.log('\n| Metric | Single application | Route modules |')
console.log('| --- | --- | --- |')
for (const [metric, singleValue, modularValue] of rows) {
  console.log(`| ${metric} | ${singleValue} | ${modularValue} |`)
}

if (process.env.KEEP) {
  console.log(workspace)
} else {
  rmSync(workspace, { recursive: true, force: true })
}
