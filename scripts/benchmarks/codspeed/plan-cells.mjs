// Picks the CodSpeed cells (benchmark x framework) that a pull request can
// affect. A selected cell runs its whole suite; the others are skipped and
// CodSpeed reports their baseline values. Over-selecting is fine, skipping a
// cell the change could affect is not, so anything unrecognised runs all cells.
//
//   node scripts/benchmarks/codspeed/plan-cells.mjs --all
//   node scripts/benchmarks/codspeed/plan-cells.mjs --base <sha> --head <sha>
//   node scripts/benchmarks/codspeed/plan-cells.mjs --files <file,file>
//
// Prints `matrix=<json>` and `has-work=<bool>` lines for $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const BENCHMARKS = {
  'client-nav': { dir: 'benchmarks/client-nav', mode: 'simulation' },
  ssr: { dir: 'benchmarks/ssr', mode: 'simulation' },
  'memory-server': { dir: 'benchmarks/memory/server', mode: 'memory' },
  'memory-client': { dir: 'benchmarks/memory/client', mode: 'memory' },
}
const FRAMEWORKS = ['react', 'solid', 'vue']
// Packages are left to Nx affected; the others feed no CodSpeed benchmark.
const NOT_BENCHMARK_FILE =
  /^(packages\/[^/]+|docs|examples|e2e|benchmarks\/bundle-size)\/|\.md$/

export const CELLS = Object.entries(BENCHMARKS).flatMap(
  ([benchmark, { mode }]) =>
    FRAMEWORKS.map((framework) => ({ benchmark, framework, mode })),
)

// `cellProjects` maps each `<benchmark>:<framework>` to the packages its CI job
// builds; `affectedProjects` is `nx show projects --affected`.
export function selectCells({ changedFiles, affectedProjects, cellProjects }) {
  const benchmarks = new Set()
  for (const file of changedFiles) {
    if (NOT_BENCHMARK_FILE.test(file)) {
      continue
    }
    // Benchmark code is shared across frameworks (the solid hydration scenario
    // imports the react fixture), so a change selects every framework of each
    // benchmark living in or below the changed file's directory.
    const matches = Object.entries(BENCHMARKS).filter(
      ([, { dir }]) =>
        file.startsWith(`${dir}/`) ||
        dir.startsWith(`${path.posix.dirname(file)}/`),
    )
    // Root config, lockfile, CI, scripts, other benchmark dirs: may affect all.
    if (matches.length === 0) {
      return CELLS
    }
    matches.forEach(([benchmark]) => benchmarks.add(benchmark))
  }
  const affected = new Set(affectedProjects)
  return CELLS.filter(
    ({ benchmark, framework }) =>
      benchmarks.has(benchmark) ||
      cellProjects[`${benchmark}:${framework}`].some((p) => affected.has(p)),
  )
}

// Calls the binary directly: `pnpm exec` may print install output to stdout.
const nx = (...args) =>
  execFileSync('node_modules/.bin/nx', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 256 * 1024 * 1024,
  })

// Every package whose build task each cell's CI job runs, read from the Nx task
// graph so new scenario dependencies need no table update here.
function readCellProjects() {
  const { tasks, dependencies } = JSON.parse(
    nx(
      'run-many',
      `--projects=${Object.keys(BENCHMARKS).map((b) => `@benchmarks/${b}`)}`,
      `--targets=${FRAMEWORKS.map((f) => `build:${f}`)}`,
      '--graph=stdout',
    ),
  ).tasks
  const cellProjects = {}
  for (const { benchmark, framework } of CELLS) {
    const queue = new Set([`@benchmarks/${benchmark}:build:${framework}`])
    for (const id of queue) {
      dependencies[id].forEach((dep) => queue.add(dep))
    }
    // Benchmark projects are left to selectCells' path rules: Nx marks the
    // umbrellas (they depend on every framework) and, via shared test:types
    // inputs, sibling benchmarks' scenarios as affected.
    cellProjects[`${benchmark}:${framework}`] = [...queue]
      .map((id) => tasks[id].target.project)
      .filter((project) => !project.startsWith('@benchmarks/'))
  }
  return cellProjects
}

function plan({ all, files, base, head }) {
  if (all) {
    return CELLS
  }
  const changedFiles = files
    ? files.split(',')
    : execFileSync(
        'git',
        ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`],
        { encoding: 'utf8' },
      )
        .split('\0')
        .filter(Boolean)
  const affectedArgs = files
    ? [`--files=${files}`]
    : [`--base=${base}`, `--head=${head}`]
  return selectCells({
    changedFiles,
    affectedProjects: JSON.parse(
      nx('show', 'projects', '--affected', '--json', ...affectedArgs),
    ),
    cellProjects: readCellProjects(),
  })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      files: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
    },
  })
  const cells = plan(values)
  console.error(
    `CodSpeed cells: ${cells.map((c) => `${c.benchmark}:${c.framework}`).join(' ') || 'none'}`,
  )
  console.log(`matrix=${JSON.stringify({ include: cells })}`)
  console.log(`has-work=${cells.length > 0}`)
}
