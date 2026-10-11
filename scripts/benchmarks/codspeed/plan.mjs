#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

export const FRAMEWORKS = /** @type {const} */ (['react', 'solid', 'vue'])

/**
 * One entry per CodSpeed benchmark. `projects` mirrors the globs of the
 * aggregate `<dir>/vitest.<framework>.config.ts` files (relative to `dir`,
 * `<framework>` substituted); `buildTarget` is the scenario target that the
 * umbrella `build:<framework>` target fans out to.
 *
 * @typedef {{
 *   benchmark: string,
 *   dir: string,
 *   mode: 'simulation' | 'memory',
 *   buildTarget: string,
 *   projects: Array<string>,
 * }} Benchmark
 * @type {ReadonlyArray<Benchmark>}
 */
export const BENCHMARKS = [
  {
    benchmark: 'client-nav',
    dir: 'benchmarks/client-nav',
    mode: 'simulation',
    buildTarget: 'build:client',
    projects: ['<framework>', 'scenarios/*/<framework>'],
  },
  {
    benchmark: 'ssr',
    dir: 'benchmarks/ssr',
    mode: 'simulation',
    buildTarget: 'build:ssr',
    projects: ['<framework>', 'scenarios/*/<framework>'],
  },
  {
    benchmark: 'memory-server',
    dir: 'benchmarks/memory/server',
    mode: 'memory',
    buildTarget: 'build:ssr',
    projects: ['scenarios/*/<framework>'],
  },
  {
    benchmark: 'memory-client',
    dir: 'benchmarks/memory/client',
    mode: 'memory',
    buildTarget: 'build:client',
    projects: ['scenarios/*/<framework>'],
  },
]

/**
 * Changes the project graph cannot attribute to scenarios: these run the full
 * suite. Scenarios have no package.json, so toolchain bumps (vite, vitest,
 * @codspeed/*, framework versions) only show up in the lockfile or workspace
 * catalog; the workflow and this planner decide what runs at all. Root
 * package.json, tsconfig.json, .nvmrc and nx.json already affect every
 * scenario through the graph (`sharedGlobals` and nx.json).
 */
export const FULL_RUN_FILES = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.github\/workflows\/client-nav-benchmarks\.yml$/,
  /^scripts\/benchmarks\/codspeed\//,
]

/**
 * @typedef {{
 *   benchmark: string,
 *   framework: string,
 *   mode: 'simulation' | 'memory',
 *   buildTarget: string,
 *   buildProjects: string,
 *   vitestProjects: string,
 *   selected: string,
 * }} Cell
 * `buildProjects`/`vitestProjects` are empty for an unfiltered cell, which
 * runs exactly like a push to main.
 *
 * @typedef {{ hasWork: boolean, reason: string, cells: Array<Cell> }} Plan
 * @typedef {Record<string, { data: { root: string, targets?: Record<string, unknown> } }>} ProjectNodes
 */

/**
 * @param {Benchmark} benchmark
 * @param {string} framework
 * @returns {Cell}
 */
function unfilteredCell(benchmark, framework) {
  return {
    benchmark: benchmark.benchmark,
    framework,
    mode: benchmark.mode,
    buildTarget: benchmark.buildTarget,
    buildProjects: '',
    vitestProjects: '',
    selected: 'all',
  }
}

/** @param {string} reason @returns {Plan} */
export function fullPlan(reason) {
  return {
    hasWork: true,
    reason,
    cells: BENCHMARKS.flatMap((benchmark) =>
      FRAMEWORKS.map((framework) => unfilteredCell(benchmark, framework)),
    ),
  }
}

/** @param {string} glob */
function globToRegExp(glob) {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+')
  return new RegExp(`^${source}$`)
}

/**
 * Locates a project in the CodSpeed suite by its root.
 *
 * @param {string} root
 * @returns {{ benchmark: Benchmark, framework: string, directory: string, order: number } | undefined}
 */
export function findScenario(root) {
  for (const benchmark of BENCHMARKS) {
    if (!root.startsWith(`${benchmark.dir}/`)) {
      continue
    }
    const directory = root.slice(benchmark.dir.length + 1)
    for (const framework of FRAMEWORKS) {
      const order = benchmark.projects.findIndex((project) =>
        globToRegExp(project.replace('<framework>', framework)).test(directory),
      )
      if (order !== -1) {
        return { benchmark, framework, directory, order }
      }
    }
  }
  return undefined
}

/**
 * @param {{
 *   changedFiles: Array<string>,
 *   affectedProjects: Array<string>,
 *   projectNodes: ProjectNodes,
 * }} input
 * @returns {Plan}
 */
export function affectedPlan({ changedFiles, affectedProjects, projectNodes }) {
  const trigger = changedFiles.find((file) =>
    FULL_RUN_FILES.some((pattern) => pattern.test(file)),
  )
  if (trigger) {
    return fullPlan(`${trigger} changed`)
  }

  /** @type {Map<string, { benchmark: Benchmark, framework: string, all: Map<string, { directory: string, order: number }> }>} */
  const suite = new Map()
  for (const [name, node] of Object.entries(projectNodes)) {
    const scenario = findScenario(node.data.root)
    if (!scenario) {
      continue
    }
    if (!node.data.targets?.[scenario.benchmark.buildTarget]) {
      throw new Error(
        `${name} (${node.data.root}) runs in the ${scenario.benchmark.benchmark} benchmark but has no ${scenario.benchmark.buildTarget} target`,
      )
    }
    // Values end up in workflow environment variables and Nx/Vitest lists.
    if (!/^[\w@./-]+$/.test(name) || !/^[\w./-]+$/.test(scenario.directory)) {
      throw new Error(`Unexpected characters in ${name} (${node.data.root})`)
    }
    const key = `${scenario.benchmark.benchmark}:${scenario.framework}`
    let cell = suite.get(key)
    if (!cell) {
      cell = {
        benchmark: scenario.benchmark,
        framework: scenario.framework,
        all: new Map(),
      }
      suite.set(key, cell)
    }
    cell.all.set(name, {
      directory: scenario.directory,
      order: scenario.order,
    })
  }

  const affected = new Set(affectedProjects)
  /** @type {Array<Cell>} */
  const cells = []
  for (const benchmark of BENCHMARKS) {
    for (const framework of FRAMEWORKS) {
      const cell = suite.get(`${benchmark.benchmark}:${framework}`)
      if (!cell) {
        continue
      }
      // Same order as the aggregate config's globs: baseline, then scenarios.
      const selected = [...cell.all]
        .filter(([name]) => affected.has(name))
        .sort(
          ([, a], [, b]) =>
            a.order - b.order || a.directory.localeCompare(b.directory),
        )
      if (selected.length === 0) {
        continue
      }
      if (selected.length === cell.all.size) {
        cells.push(unfilteredCell(benchmark, framework))
        continue
      }
      cells.push({
        ...unfilteredCell(benchmark, framework),
        buildProjects: selected.map(([name]) => name).join(','),
        vitestProjects: selected
          .map(([, { directory }]) => directory)
          .join(','),
        selected: `${selected.length}/${cell.all.size}`,
      })
    }
  }

  return {
    hasWork: cells.length > 0,
    reason:
      cells.length > 0
        ? 'scenarios affected by the change'
        : 'no benchmark scenario is affected',
    cells,
  }
}

/** @param {Plan} plan */
export function formatSummary(plan) {
  const lines = [`CodSpeed benchmark plan: ${plan.reason}`]
  for (const cell of plan.cells) {
    const scenarios = cell.vitestProjects
      ? cell.vitestProjects.split(',').join(', ')
      : 'all scenarios'
    lines.push(
      `- ${cell.benchmark}:${cell.framework} (${cell.selected}): ${scenarios}`,
    )
  }
  return lines.join('\n')
}

/**
 * @typedef {(command: string, args: Array<string>, options: { cwd: string, env: NodeJS.ProcessEnv, encoding: 'utf8', maxBuffer: number }) => { status: number | null, stdout: string, stderr: string, error?: Error }} Execute
 */

/**
 * @param {Execute} execute
 * @param {NodeJS.ProcessEnv} env
 * @param {string} command
 * @param {Array<string>} args
 */
function capture(execute, env, command, args) {
  const result = execute(command, args, {
    cwd: repoRoot,
    // Local graph queries only: never use Nx Cloud or a daemon.
    env: { ...env, NX_NO_CLOUD: 'true', NX_DAEMON: 'false' },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr}`,
    )
  }
  return result.stdout
}

/** @param {string} output */
function parseJsonArray(output) {
  // Tolerate tool banners around the JSON payload.
  return JSON.parse(
    output.slice(output.indexOf('['), output.lastIndexOf(']') + 1),
  )
}

/**
 * @param {Array<string>} argv
 * @param {{ execute?: Execute, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Plan}
 */
export function plan(argv, { execute = spawnSync, env = process.env } = {}) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      mode: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      files: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    console.log(`Usage: node scripts/benchmarks/codspeed/plan.mjs --mode full
       node scripts/benchmarks/codspeed/plan.mjs --mode affected --base <sha> --head <sha>
       node scripts/benchmarks/codspeed/plan.mjs --mode affected --files <file,file>

Prints the CodSpeed benchmark matrix. In GitHub Actions it also writes the
"matrix" and "has-work" step outputs.`)
    return fullPlan('help')
  }

  /** @type {Plan} */
  let result
  if (values.mode === 'full') {
    result = fullPlan('full run')
  } else if (values.mode === 'affected') {
    /** @type {Array<string>} */
    let affectedArgs
    /** @type {Array<string>} */
    let changedFiles
    if (values.files !== undefined) {
      changedFiles = values.files.split(',').filter(Boolean)
      affectedArgs = [`--files=${changedFiles.join(',')}`]
    } else if (values.base && values.head) {
      changedFiles = capture(execute, env, 'git', [
        'diff',
        '--name-only',
        '--no-renames',
        `${values.base}...${values.head}`,
      ])
        .split('\n')
        .filter(Boolean)
      affectedArgs = [`--base=${values.base}`, `--head=${values.head}`]
    } else {
      throw new Error('--mode affected needs --base and --head, or --files')
    }

    if (changedFiles.length === 0) {
      return report(
        { hasWork: false, reason: 'no files changed', cells: [] },
        env,
      )
    }

    const graphDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codspeed-plan-'))
    try {
      const graphFile = path.join(graphDir, 'graph.json')
      capture(execute, env, 'pnpm', ['nx', 'graph', `--file=${graphFile}`])
      const projectNodes = JSON.parse(fs.readFileSync(graphFile, 'utf8')).graph
        .nodes
      const affectedProjects = parseJsonArray(
        capture(execute, env, 'pnpm', [
          'nx',
          'show',
          'projects',
          '--affected',
          ...affectedArgs,
          '--json',
        ]),
      )
      result = affectedPlan({ changedFiles, affectedProjects, projectNodes })
    } finally {
      fs.rmSync(graphDir, { recursive: true, force: true })
    }
  } else {
    throw new Error('--mode must be "full" or "affected"')
  }

  return report(result, env)
}

/**
 * @param {Plan} result
 * @param {NodeJS.ProcessEnv} env
 */
function report(result, env) {
  const summary = formatSummary(result)
  console.log(summary)
  const matrix = JSON.stringify({ include: result.cells })
  console.log(matrix)
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `matrix=${matrix}\nhas-work=${result.hasWork}\n`,
    )
  }
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }
  return result
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  plan(process.argv.slice(2))
}
