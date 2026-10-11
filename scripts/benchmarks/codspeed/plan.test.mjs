import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BENCHMARKS,
  FRAMEWORKS,
  affectedPlan,
  findScenario,
  fullPlan,
  plan,
} from './plan.mjs'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * @param {string} root
 * @param {Array<string>} [targets]
 */
function node(root, targets = []) {
  return {
    data: {
      root,
      targets: Object.fromEntries(targets.map((target) => [target, {}])),
    },
  }
}

const projectNodes = {
  '@tanstack/solid-router': node('packages/solid-router', ['build']),
  '@benchmarks/client-nav': node('benchmarks/client-nav', ['build:solid']),
  '@benchmarks/react-link-performance': node(
    'benchmarks/client-nav/link-performance',
    ['build:client'],
  ),
  '@benchmarks/client-nav-solid': node('benchmarks/client-nav/solid', [
    'build:client',
  ]),
  '@benchmarks/client-nav-loaders-solid': node(
    'benchmarks/client-nav/scenarios/loaders/solid',
    ['build:client'],
  ),
  '@benchmarks/client-nav-head-solid': node(
    'benchmarks/client-nav/scenarios/head/solid',
    ['build:client'],
  ),
  '@benchmarks/client-nav-head-react': node(
    'benchmarks/client-nav/scenarios/head/react',
    ['build:client'],
  ),
  '@benchmarks/ssr-vue': node('benchmarks/ssr/vue', ['build:ssr']),
  '@benchmarks/memory-server-request-churn-vue': node(
    'benchmarks/memory/server/scenarios/request-churn/vue',
    ['build:ssr'],
  ),
  '@benchmarks/memory-server-error-paths-vue': node(
    'benchmarks/memory/server/scenarios/error-paths/vue',
    ['build:ssr'],
  ),
  '@benchmarks/memory-client-mount-unmount-react': node(
    'benchmarks/memory/client/scenarios/mount-unmount/react',
    ['build:client'],
  ),
}

test('full plan runs every benchmark and framework unfiltered', () => {
  const result = fullPlan('push')
  assert.equal(result.hasWork, true)
  assert.deepEqual(
    result.cells.map((cell) => `${cell.benchmark}:${cell.framework}`),
    [
      'client-nav:react',
      'client-nav:solid',
      'client-nav:vue',
      'ssr:react',
      'ssr:solid',
      'ssr:vue',
      'memory-server:react',
      'memory-server:solid',
      'memory-server:vue',
      'memory-client:react',
      'memory-client:solid',
      'memory-client:vue',
    ],
  )
  for (const cell of result.cells) {
    assert.equal(cell.buildProjects, '')
    assert.equal(cell.vitestProjects, '')
  }
  assert.deepEqual(
    result.cells.map((cell) => cell.mode),
    [...Array(6).fill('simulation'), ...Array(6).fill('memory')],
  )
})

test('maps project roots to benchmark cells', () => {
  assert.deepEqual(findScenario('benchmarks/client-nav/solid'), {
    benchmark: BENCHMARKS[0],
    framework: 'solid',
    directory: 'solid',
    order: 0,
  })
  assert.equal(
    findScenario('benchmarks/memory/client/scenarios/mount-unmount/vue')
      ?.benchmark.benchmark,
    'memory-client',
  )
  assert.equal(findScenario('benchmarks/client-nav'), undefined)
  assert.equal(
    findScenario('benchmarks/client-nav/link-performance'),
    undefined,
  )
  assert.equal(findScenario('benchmarks/client-nav/scenarios/head'), undefined)
  assert.equal(
    findScenario('benchmarks/client-nav/scenarios/a/b/solid'),
    undefined,
  )
  // Memory benchmarks have no baseline app per framework.
  assert.equal(findScenario('benchmarks/memory/client/react'), undefined)
  assert.equal(findScenario('benchmarks/bundle-size/scenarios/x'), undefined)
})

test('selects only cells with affected scenarios, baseline first', () => {
  const result = affectedPlan({
    changedFiles: ['benchmarks/client-nav/scenarios/loaders/shared.ts'],
    affectedProjects: [
      '@benchmarks/client-nav',
      '@benchmarks/react-link-performance',
      '@benchmarks/client-nav-loaders-solid',
      '@benchmarks/client-nav-solid',
      '@benchmarks/memory-server-request-churn-vue',
      '@tanstack/solid-router',
    ],
    projectNodes,
  })
  assert.equal(result.hasWork, true)
  assert.deepEqual(result.cells, [
    {
      benchmark: 'client-nav',
      framework: 'solid',
      mode: 'simulation',
      buildTarget: 'build:client',
      buildProjects:
        '@benchmarks/client-nav-solid,@benchmarks/client-nav-loaders-solid',
      vitestProjects: 'solid,scenarios/loaders/solid',
      selected: '2/3',
    },
    {
      benchmark: 'memory-server',
      framework: 'vue',
      mode: 'memory',
      buildTarget: 'build:ssr',
      buildProjects: '@benchmarks/memory-server-request-churn-vue',
      vitestProjects: 'scenarios/request-churn/vue',
      selected: '1/2',
    },
  ])
})

test('a cell whose scenarios are all affected runs unfiltered', () => {
  const result = affectedPlan({
    changedFiles: ['packages/react-router/src/index.tsx'],
    affectedProjects: [
      '@benchmarks/client-nav-head-react',
      '@benchmarks/memory-client-mount-unmount-react',
    ],
    projectNodes,
  })
  assert.deepEqual(
    result.cells.map((cell) => [
      `${cell.benchmark}:${cell.framework}`,
      cell.buildProjects,
      cell.vitestProjects,
    ]),
    [
      ['client-nav:react', '', ''],
      ['memory-client:react', '', ''],
    ],
  )
})

test('reports no work when no scenario is affected', () => {
  const result = affectedPlan({
    changedFiles: ['packages/solid-router/src/index.tsx'],
    affectedProjects: ['@tanstack/solid-router', '@benchmarks/client-nav'],
    projectNodes,
  })
  assert.equal(result.hasWork, false)
  assert.deepEqual(result.cells, [])
})

test('falls back to a full run for changes the graph cannot see', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.github/workflows/client-nav-benchmarks.yml',
    'scripts/benchmarks/codspeed/plan.mjs',
  ]) {
    const result = affectedPlan({
      changedFiles: ['docs/readme.md', file],
      affectedProjects: [],
      projectNodes,
    })
    assert.equal(result.reason, `${file} changed`)
    assert.equal(result.cells.length, 12)
    assert.ok(result.cells.every((cell) => cell.vitestProjects === ''))
  }
  assert.equal(
    affectedPlan({
      changedFiles: ['packages/pnpm-lock.yaml', '.github/workflows/pr.yml'],
      affectedProjects: [],
      projectNodes,
    }).hasWork,
    false,
  )
})

test('rejects suite projects without the build target', () => {
  assert.throws(
    () =>
      affectedPlan({
        changedFiles: ['x'],
        affectedProjects: [],
        projectNodes: {
          '@benchmarks/ssr-vue': node('benchmarks/ssr/vue', ['build:client']),
        },
      }),
    /has no build:ssr target/,
  )
})

test('benchmark table matches the aggregate Vitest configs', () => {
  for (const benchmark of BENCHMARKS) {
    for (const framework of FRAMEWORKS) {
      const config = fs.readFileSync(
        path.join(repoRoot, benchmark.dir, `vitest.${framework}.config.ts`),
        'utf8',
      )
      const projects = config.match(
        /selectBenchmarkProjects\((\[[^\]]*\])\)/,
      )?.[1]
      assert.ok(projects, `${benchmark.dir} ${framework}`)
      assert.deepEqual(
        JSON.parse(projects.replaceAll("'", '"').replace(/,\s*\]$/, ']')),
        benchmark.projects.map(
          (project) =>
            `./${project.replace('<framework>', framework)}/vite.config.ts`,
        ),
      )
    }
  }
})

test('benchmark table matches the umbrella build targets', () => {
  for (const benchmark of BENCHMARKS) {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, benchmark.dir, 'package.json'),
        'utf8',
      ),
    )
    assert.equal(pkg.name, `@benchmarks/${benchmark.benchmark}`)
    for (const framework of FRAMEWORKS) {
      const targets = pkg.nx.targets[`build:${framework}`].dependsOn.map(
        (/** @type {{ target: string }} */ dependency) => dependency.target,
      )
      assert.deepEqual(targets, [benchmark.buildTarget])
    }
  }
})

test('selectBenchmarkProjects narrows the aggregate config', async (t) => {
  const { selectBenchmarkProjects } =
    await import('../../../benchmarks/vitest-projects.ts')
  const globs = ['./solid/vite.config.ts', './scenarios/*/solid/vite.config.ts']
  const previous = process.env.BENCHMARK_VITEST_PROJECTS
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BENCHMARK_VITEST_PROJECTS
    } else {
      process.env.BENCHMARK_VITEST_PROJECTS = previous
    }
  })

  delete process.env.BENCHMARK_VITEST_PROJECTS
  assert.equal(selectBenchmarkProjects(globs), globs)
  process.env.BENCHMARK_VITEST_PROJECTS = ''
  assert.equal(selectBenchmarkProjects(globs), globs)

  process.env.BENCHMARK_VITEST_PROJECTS = 'solid,scenarios/loaders/solid'
  assert.deepEqual(selectBenchmarkProjects(globs), [
    './solid/vite.config.ts',
    './scenarios/loaders/solid/vite.config.ts',
  ])

  for (const invalid of [
    'react',
    'scenarios/loaders/react',
    'scenarios/a/b/solid',
    'scenarios/loaders',
  ]) {
    process.env.BENCHMARK_VITEST_PROJECTS = invalid
    assert.throws(() => selectBenchmarkProjects(globs), /does not match/)
  }
})

/**
 * @param {import('node:test').TestContext} t
 * @param {Array<string>} affected
 * @param {string} diff
 */
function fakeExecute(t, affected, diff = '') {
  /** @type {Array<{ command: string, args: Array<string>, env: NodeJS.ProcessEnv }>} */
  const calls = []
  /** @type {import('./plan.mjs').Execute} */
  const execute = (command, args, options) => {
    calls.push({ command, args, env: options.env })
    if (command === 'git') {
      return { status: 0, stdout: diff, stderr: '' }
    }
    const file = args.find((arg) => arg.startsWith('--file='))
    if (file) {
      fs.writeFileSync(
        file.slice('--file='.length),
        JSON.stringify({ graph: { nodes: projectNodes } }),
      )
      return { status: 0, stdout: '', stderr: '' }
    }
    return {
      status: 0,
      stdout: `\n${JSON.stringify(affected)}\n`,
      stderr: '',
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codspeed-plan-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const env = {
    PATH: process.env.PATH,
    NX_DAEMON: 'true',
    GITHUB_OUTPUT: path.join(dir, 'output'),
    GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
  }
  return { calls, execute, env }
}

test('affected mode queries git and Nx locally and writes step outputs', (t) => {
  const { calls, execute, env } = fakeExecute(
    t,
    ['@benchmarks/client-nav-head-solid'],
    'benchmarks/client-nav/scenarios/head/shared.ts\n',
  )
  t.mock.method(console, 'log', () => {})

  const result = plan(
    ['--mode', 'affected', '--base', 'abc', '--head', 'def'],
    {
      execute,
      env,
    },
  )

  assert.deepEqual(
    calls.map((call) => [
      call.command,
      ...call.args.map((arg) => arg.replace(/--file=.*/, '--file=<tmp>')),
    ]),
    [
      ['git', 'diff', '--name-only', '--no-renames', 'abc...def'],
      ['pnpm', 'nx', 'graph', '--file=<tmp>'],
      [
        'pnpm',
        'nx',
        'show',
        'projects',
        '--affected',
        '--base=abc',
        '--head=def',
        '--json',
      ],
    ],
  )
  for (const call of calls) {
    assert.equal(call.env.NX_NO_CLOUD, 'true')
    assert.equal(call.env.NX_DAEMON, 'false')
  }
  assert.equal(result.cells.length, 1)

  const output = fs.readFileSync(env.GITHUB_OUTPUT, 'utf8')
  const lines = output.trim().split('\n')
  assert.equal(lines.length, 2)
  assert.ok(lines[0].startsWith('matrix='))
  assert.deepEqual(JSON.parse(lines[0].slice('matrix='.length)), {
    include: result.cells,
  })
  assert.equal(lines[1], 'has-work=true')
  assert.match(
    fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'),
    /client-nav:solid \(1\/3\): scenarios\/head\/solid/,
  )
})

test('affected mode with a file list skips git', (t) => {
  const { calls, execute, env } = fakeExecute(t, [])
  t.mock.method(console, 'log', () => {})

  const result = plan(
    ['--mode', 'affected', '--files', 'docs/a.md,docs/b.md'],
    { execute, env },
  )

  assert.deepEqual(calls[1].args, [
    'nx',
    'show',
    'projects',
    '--affected',
    '--files=docs/a.md,docs/b.md',
    '--json',
  ])
  assert.equal(result.hasWork, false)
  assert.match(
    fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'),
    /^matrix=\{"include":\[\]\}\nhas-work=false\n$/,
  )
})

test('full mode and an empty diff do not query Nx', (t) => {
  const { calls, execute, env } = fakeExecute(t, [])
  t.mock.method(console, 'log', () => {})

  assert.equal(plan(['--mode', 'full'], { execute, env }).cells.length, 12)
  assert.equal(
    plan(['--mode', 'affected', '--base', 'a', '--head', 'b'], {
      execute,
      env,
    }).hasWork,
    false,
  )
  assert.deepEqual(
    calls.map((call) => call.command),
    ['git'],
  )
})

test('rejects missing or unknown modes', () => {
  assert.throws(() => plan([], { env: {} }), /--mode must be/)
  assert.throws(
    () => plan(['--mode', 'affected', '--base', 'a'], { env: {} }),
    /needs --base and --head/,
  )
})
