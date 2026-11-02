import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const root = fs.realpathSync(option('--root', process.cwd()))
const label = option('--label', 'candidate')
const output = path.resolve(
  option('--out', path.join(os.tmpdir(), `start-module-types-${label}`)),
)
const counts = option('--counts', '1,8,32').split(',').map(Number)
const repeats = Number(option('--repeats', '3'))
const warmups = Number(option('--warmups', '1'))
const compilerPackage = option('--compiler-package', 'typescript59')
const run = args.includes('--run')
if (
  !counts.every((n) => Number.isInteger(n) && n > 0) ||
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  !Number.isInteger(warmups) ||
  warmups < 0
) {
  throw new Error(
    'Counts/repeats must be positive integers and warmups nonnegative.',
  )
}
const packageRoot = path.join(root, 'packages/start-client-core')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
)
const modern = Object.hasOwn(packageJson.exports, './_internal/route-module')
const factoryEntry = modern
  ? '@tanstack/start-client-core/_internal/route-module'
  : '@tanstack/start-client-core'
const compilerRoot = fs.realpathSync(
  path.join(root, 'node_modules', compilerPackage),
)
const compiler = path.join(compilerRoot, 'lib/tsc.js')
const compilerVersion = JSON.parse(
  fs.readFileSync(path.join(compilerRoot, 'package.json'), 'utf8'),
).version

if (fs.existsSync(path.join(output, 'results.json'))) {
  throw new Error(
    `Results already exist in ${output}; use a new --out to preserve the recorded run.`,
  )
}
fs.mkdirSync(output, { recursive: true })
function link(target, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  if (fs.existsSync(destination)) {
    if (fs.realpathSync(destination) !== fs.realpathSync(target)) {
      throw new Error(`Existing link points elsewhere: ${destination}`)
    }
    return
  }
  fs.symlinkSync(target, destination, 'dir')
}
link(packageRoot, path.join(output, 'node_modules/@tanstack/start-client-core'))
link(
  fs.realpathSync(path.join(root, 'node_modules/@types/node')),
  path.join(output, 'node_modules/@types/node'),
)
fs.writeFileSync(
  path.join(output, 'package.json'),
  JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n',
)

function source(count, scenario) {
  const ids = Array.from(
    { length: count },
    (_, index) => `@start-type-probe/fragment-${index}`,
  )
  const declarations = modern
    ? `declare module '@tanstack/start-client-core' {\n  interface StartModuleRequirements {\n${ids.map((id) => `    '${id}': { requestContext: { viewer: string } }`).join('\n')}\n  }\n}`
    : `const requireViewer = requireRequestContext<{ viewer: string }>()`
  const fragments = ids
    .map((id, index) => {
      const middleware =
        scenario === 'flat'
          ? `const middleware${index} = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { step${index}: true } }))`
          : `// This object differs from sharedAudit at runtime but has the same type.
const independentAudit${index} = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { auditTag: 'fragment' } }))
const dependency${index} = createMiddleware({ type: 'function' })
  .middleware([sharedAudit, independentAudit${index}])
  .server(({ next }) => next({ context: { step${index}: true } }))
const middleware${index} = createMiddleware({ type: 'function' })
  .middleware([dependency${index}, sharedAudit])
  .server(({ context, next }) => {
    const tag: string = context.auditTag
    const retainsInference: 0 extends (1 & typeof context.auditTag) ? never : true = true
    return next({ context: { lastAuditTag: tag, retainsInference } })
  })`
      return `${middleware}
const fragment${index} = createStartModule('${id}')(() => ({
${modern ? '' : '  requestMiddleware: [requireViewer],\n'}  functionMiddleware: [middleware${index}],
}))`
    })
    .join('\n\n')
  return `// Same executable middleware graph and context on both revisions.
// Only the package's supported factory export and requirement syntax differ.
import { createStart, createMiddleware${modern ? '' : ', requireRequestContext'} } from '@tanstack/start-client-core'
import { createStartModule } from '${factoryEntry}'
import type { AssertStartModules, ValidateStartModules } from '@tanstack/start-client-core'

${declarations}

const viewer = createMiddleware().server(({ next }) => next({ context: { viewer: 'benchmark' } }))
const sharedAudit = createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { auditTag: 'host' } }))

${fragments}

const fragments = [${ids.map((_, index) => `fragment${index}`).join(', ')}] as const
export const start = createStart(() => ({
  requestMiddleware: [viewer],
  functionMiddleware: [sharedAudit],
  extends: fragments,
}))
export type Validation = AssertStartModules<ValidateStartModules<typeof start, typeof fragments>>
export const valid: Validation = true
type ExpectTrue<T extends true> = T
type Options = Awaited<ReturnType<typeof start.getOptions>>
// Force the complete installed contribution tuple without relying on any.
export type InstalledCount = ExpectTrue<Options['~types']['functionMiddleware']['length'] extends ${count + 1} ? true : false>
`
}

const cases = [
  { name: 'empty', count: 0, scenario: 'flat' },
  ...['flat', 'nested-dedupe'].flatMap((scenario) =>
    counts.map((count) => ({ name: `${scenario}-${count}`, count, scenario })),
  ),
]
for (const item of cases) {
  const directory = path.join(output, item.name)
  fs.mkdirSync(directory, { recursive: true })
  const code = source(item.count, item.scenario)
  fs.writeFileSync(path.join(directory, 'consumer.ts'), code)
  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['DOM', 'DOM.Iterable', 'ES2022'],
          types: ['node'],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          incremental: false,
        },
        files: ['consumer.ts'],
      },
      null,
      2,
    ) + '\n',
  )
  item.sourceSha256 = createHash('sha256').update(code).digest('hex')
}

const declarations = [
  'createStart.d.ts',
  'createStartModule.d.ts',
  'createMiddleware.d.ts',
  'createServerFn.d.ts',
].map((name) => {
  const file = path.join(packageRoot, 'dist/esm', name)
  return {
    file,
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  }
})
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim()
const status = spawnSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).stdout
const manifest = {
  label,
  root,
  revision,
  dirty: status.length > 0,
  node: process.version,
  compilerPackage,
  compilerVersion,
  factoryEntry,
  requirements: modern
    ? 'type-only augmentation'
    : 'baseline requirement marker',
  warmups,
  repeats,
  skipLibCheck: true,
  declarations,
  cases,
  command: [
    process.execPath,
    compiler,
    '--project',
    '<case>/tsconfig.json',
    '--extendedDiagnostics',
    '--pretty',
    'false',
  ],
  notes: [
    'Parent must build the selected checkout through Nx before running this probe.',
    'Instantiations is the primary metric. Wall time is supporting evidence only.',
    'Each subprocess is a fresh compiler process; the first run per case is discarded.',
    'No source aliases or manual declaration stubs: package exports resolve built declarations.',
    "Requirements use each revision's supported syntax; executable middleware and host context are equivalent.",
    'Nested cases reuse a global object and add distinct objects with equal types, without breaking required context.',
    'skipLibCheck matches repository consumer defaults and isolates referenced generic work; full declaration correctness uses the package matrix.',
  ],
}
fs.writeFileSync(
  path.join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(
  `Prepared ${cases.length} cases in ${output}; TypeScript ${compilerVersion}; ${run ? 'running' : 'no compiler runs requested'}.`,
)
if (run) {
  const results = []
  for (const item of cases) {
    const samples = []
    for (let sample = -warmups; sample < repeats; sample++) {
      const started = performance.now()
      const result = spawnSync(
        process.execPath,
        [
          compiler,
          '--project',
          path.join(output, item.name, 'tsconfig.json'),
          '--extendedDiagnostics',
          '--pretty',
          'false',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      )
      const elapsedMs = performance.now() - started
      const log = `${result.stdout ?? ''}${result.stderr ?? ''}`
      const sampleName =
        sample < 0 ? `warmup-${sample + warmups + 1}` : `sample-${sample + 1}`
      fs.writeFileSync(path.join(output, item.name, `${sampleName}.log`), log)
      if (result.error || result.status !== 0) {
        fs.writeFileSync(
          path.join(output, 'failed.json'),
          JSON.stringify(
            {
              case: item.name,
              sample: sampleName,
              status: result.status,
              error: String(result.error ?? ''),
              log,
            },
            null,
            2,
          ) + '\n',
        )
        throw new Error(
          `${item.name}/${sampleName} failed. See ${path.join(output, item.name, `${sampleName}.log`)}; no successful measurement claimed.`,
        )
      }
      const metric = (name) =>
        Number(new RegExp(`^${name}:\\s+([\\d.]+)`, 'm').exec(log)?.[1])
      const value = {
        elapsedMs,
        instantiations: metric('Instantiations'),
        types: metric('Types'),
        checkSeconds: metric('Check time'),
        totalSeconds: metric('Total time'),
        memoryKiB: metric('Memory used'),
      }
      if (!Number.isFinite(value.instantiations)) {
        throw new Error(
          `Missing extended diagnostics for ${item.name}/${sampleName}`,
        )
      }
      if (sample >= 0) {
        samples.push(value)
      }
    }
    const instantiationCounts = [
      ...new Set(samples.map((sample) => sample.instantiations)),
    ]
    if (instantiationCounts.length !== 1) {
      throw new Error(
        `Unstable compiler work for ${item.name}: ${instantiationCounts.join(', ')}`,
      )
    }
    const elapsed = samples
      .map((sample) => sample.elapsedMs)
      .sort((a, b) => a - b)
    const result = {
      ...item,
      instantiations: instantiationCounts[0],
      medianElapsedMs: elapsed[Math.floor(elapsed.length / 2)],
      samples,
    }
    results.push(result)
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify({ ...manifest, results }, null, 2) + '\n',
    )
    console.log(
      `${item.name}: ${result.instantiations} instantiations; ${result.medianElapsedMs.toFixed(1)} ms median (${repeats} samples; ${warmups} discarded warmup).`,
    )
  }
}
