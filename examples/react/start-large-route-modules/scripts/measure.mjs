// Measures production builds of the application with the modules `pnpm gen`
// generated last.
//
//   pnpm measure [--toolchain vite|rsbuild] [--runs <count>] [--profile]
//
// Each run is a fresh build process without the type check. `--profile` adds
// one run under the V8 CPU profiler and lists where the JavaScript thread
// spent its time, grouped by package. Work in native threads (Rolldown, Oxc,
// Rspack, SWC) shows up only as the JavaScript thread waiting for it.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    toolchain: { type: 'string', multiple: true },
    runs: { type: 'string', default: '3' },
    profile: { type: 'boolean', default: false },
  },
})
const toolchains = values.toolchain ?? ['vite', 'rsbuild']
const runs = Number(values.runs)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(root, 'app')
const modulesDir = path.join(root, 'modules')
const require = createRequire(path.join(root, 'package.json'))

const bins = {
  vite: path.join(
    path.dirname(require.resolve('vite/package.json')),
    'bin',
    'vite.js',
  ),
  rsbuild: path.join(
    path.dirname(require.resolve('@rsbuild/core/package.json')),
    'bin',
    'rsbuild.js',
  ),
}

if (!existsSync(path.join(appDir, 'route-modules.gen.ts'))) {
  throw new Error('Generate the modules first: pnpm gen')
}

async function listFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)))
    } else {
      files.push(full)
    }
  }
  return files
}

function build(toolchain, nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const child = spawn(
      process.execPath,
      [...nodeArgs, bins[toolchain], 'build'],
      {
        cwd: appDir,
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    )
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${toolchain} build failed:\n${stderr}`))
      } else {
        resolve(performance.now() - started)
      }
    })
  })
}

const workspacePackages = path.resolve(root, '..', '..', '..', 'packages')

/** The package a profiled function belongs to, or a V8 category. */
function categorize(callFrame) {
  const url = callFrame.url
  if (!url) {
    return callFrame.functionName.startsWith('(')
      ? callFrame.functionName
      : '(native)'
  }
  if (url.startsWith('node:')) {
    return 'node'
  }
  const file = url.startsWith('file://') ? fileURLToPath(url) : url
  const nodeModules = file.lastIndexOf(`${path.sep}node_modules${path.sep}`)
  if (nodeModules !== -1) {
    const [first, second] = file
      .slice(nodeModules + '/node_modules/'.length)
      .split(path.sep)
    return first.startsWith('@') ? `${first}/${second}` : first
  }
  if (file.startsWith(workspacePackages + path.sep)) {
    return `@tanstack/${file.slice(workspacePackages.length + 1).split(path.sep)[0]}`
  }
  return path.relative(root, file).split(path.sep)[0]
}

/**
 * Sums the sampled time of the profiles by the package of the sampled
 * function, except that time spent inside a TanStack package's call (its
 * Babel passes, for example) counts for the outermost TanStack package on the
 * stack: the plugin that ran.
 */
async function summarizeProfiles(dir) {
  const times = new Map()
  let total = 0
  for (const file of await readdir(dir)) {
    const profile = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
    const parents = new Map()
    for (const node of profile.nodes) {
      for (const child of node.children ?? []) {
        parents.set(child, node.id)
      }
    }
    const owners = new Map()
    const ownerOf = (id) => {
      if (!owners.has(id)) {
        const parent = parents.get(id)
        const outer = parent === undefined ? undefined : ownerOf(parent)
        const category = categorize(nodes.get(id).callFrame)
        owners.set(
          id,
          outer ?? (category.startsWith('@tanstack/') ? category : undefined),
        )
      }
      return owners.get(id)
    }
    for (let index = 0; index < profile.samples.length; index++) {
      const id = profile.samples[index]
      const delta = profile.timeDeltas[index] / 1000
      const owner = ownerOf(id)
      const category = owner
        ? `${owner} (with callees)`
        : categorize(nodes.get(id).callFrame)
      times.set(category, (times.get(category) ?? 0) + delta)
      total += delta
    }
  }
  return {
    total,
    categories: [...times]
      .sort((a, b) => b[1] - a[1])
      .map(([category, ms]) => ({ category, ms })),
  }
}

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}
const ms = (value) => `${Math.round(value).toLocaleString('en-US')} ms`

const moduleNames = (await readdir(modulesDir)).filter(
  (name) => name !== 'node_modules',
)
const moduleFiles = (
  await Promise.all(
    moduleNames.map((name) => listFiles(path.join(modulesDir, name, 'src'))),
  )
).flat()
const moduleCount = moduleNames.length
const transpiled = !moduleFiles.some((file) => /\.tsx?$/.test(file))
console.log(
  `${moduleCount} modules, ${moduleFiles.length} module source files (${transpiled ? 'transpiled JavaScript' : 'TypeScript'})`,
)

const results = {
  date: new Date().toISOString(),
  modules: moduleCount,
  moduleFiles: moduleFiles.length,
  transpiled,
  toolchains: {},
}

for (const toolchain of toolchains) {
  if (!bins[toolchain]) {
    throw new Error(`Unknown toolchain "${toolchain}": use vite or rsbuild`)
  }
  const times = []
  for (let run = 0; run < runs; run++) {
    await rm(path.join(appDir, 'dist'), { recursive: true, force: true })
    times.push(await build(toolchain))
  }
  const clientChunks = (
    await listFiles(path.join(appDir, 'dist', 'client'))
  ).filter((file) => file.endsWith('.js')).length
  console.log(
    `${toolchain}: median ${ms(median(times))}, min ${ms(Math.min(...times))} over ${runs} runs (${clientChunks} client chunks)`,
  )
  const result = { times, clientChunks }

  if (values.profile) {
    const profileDir = path.join(
      root,
      'measurements',
      `${toolchain}-cpuprofile`,
    )
    await rm(profileDir, { recursive: true, force: true })
    await mkdir(profileDir, { recursive: true })
    await rm(path.join(appDir, 'dist'), { recursive: true, force: true })
    await build(toolchain, ['--cpu-prof', `--cpu-prof-dir=${profileDir}`])
    const summary = await summarizeProfiles(profileDir)
    console.log(`  JavaScript threads, ${ms(summary.total)} sampled:`)
    for (const { category, ms: time } of summary.categories.slice(0, 15)) {
      console.log(
        `    ${category.padEnd(44)} ${ms(time).padStart(10)}  ${((time / summary.total) * 100).toFixed(1).padStart(5)}%`,
      )
    }
    result.profile = summary
  }
  results.toolchains[toolchain] = result
}

await mkdir(path.join(root, 'measurements'), { recursive: true })
const resultFile = path.join(
  root,
  'measurements',
  `${results.date.replace(/[:.]/g, '-')}.json`,
)
await writeFile(resultFile, `${JSON.stringify(results, null, 2)}\n`)
console.log(`Saved ${path.relative(root, resultFile)}`)
