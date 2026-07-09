import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CODSPEED_VERSION = '4.17.0'
const CODSPEED_INSTALLER_SHA256 =
  'b5151c275a2b8055593cc20e7d3d0258059e07c8b633a7bb2519df9306f9fd67'

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

const benchmarkConfigs = {
  'client-nav': {
    mode: 'simulation',
    cwd: 'benchmarks/client-nav',
    frameworks: {
      react: 'vitest.react.config.ts',
      solid: 'vitest.solid.config.ts',
      vue: 'vitest.vue.config.ts',
    },
  },
  ssr: {
    mode: 'simulation',
    cwd: 'benchmarks/ssr',
    frameworks: {
      react: 'vitest.react.config.ts',
      solid: 'vitest.solid.config.ts',
      vue: 'vitest.vue.config.ts',
    },
  },
  'memory-client': {
    mode: 'memory',
    cwd: 'benchmarks/memory/client',
    frameworks: {
      react: 'vitest.react.config.ts',
      solid: 'vitest.solid.config.ts',
      vue: 'vitest.vue.config.ts',
    },
  },
  'memory-server': {
    mode: 'memory',
    cwd: 'benchmarks/memory/server',
    frameworks: {
      react: 'vitest.react.config.ts',
      solid: 'vitest.solid.config.ts',
      vue: 'vitest.vue.config.ts',
    },
  },
}

const [benchmark, framework] = process.argv.slice(2)
const benchmarkConfig = benchmarkConfigs[benchmark]
const vitestConfig = benchmarkConfig?.frameworks[framework]

if (!benchmarkConfig || !vitestConfig) {
  console.error(
    `Usage: node scripts/nx/run-codspeed-benchmark.mjs <${Object.keys(
      benchmarkConfigs,
    ).join('|')}> <react|solid|vue>`,
  )
  process.exit(1)
}

await ensureGithubEventPath()

const codspeed = await findCodSpeedBinary()
const codspeedArgs = [
  'run',
  `--mode=${process.env.CODSPEED_MODE ?? benchmarkConfig.mode}`,
]

if (process.env.CODSPEED_TOKEN) {
  codspeedArgs.push('--token', process.env.CODSPEED_TOKEN)
}

codspeedArgs.push(
  '--',
  'bash',
  '-lc',
  `NODE_ENV=production vitest bench --config ./${vitestConfig}`,
)

await execFile(codspeed, codspeedArgs, {
  cwd: join(rootDir, benchmarkConfig.cwd),
  env: {
    ...process.env,
    WITH_INSTRUMENTATION: '1',
  },
})

async function ensureGithubEventPath() {
  if (process.env.GITHUB_EVENT_PATH || process.env.GITHUB_ACTIONS !== 'true') {
    return
  }

  const eventDir = await mkdtemp(join(tmpdir(), 'codspeed-github-event-'))
  const eventPath = join(eventDir, 'event.json')
  const repository = process.env.GITHUB_REPOSITORY ?? ''
  const pullRequestNumber = getPullRequestNumber()
  const event = {
    repository: {
      full_name: repository,
    },
    ...(pullRequestNumber ? { number: pullRequestNumber } : {}),
    pull_request: {
      ...(pullRequestNumber ? { number: pullRequestNumber } : {}),
      head: {
        ref: process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? '',
        sha: process.env.GITHUB_SHA ?? '',
        repo: {
          full_name: repository,
        },
      },
      base: {
        ref: process.env.GITHUB_BASE_REF ?? '',
        repo: {
          full_name: repository,
        },
      },
    },
  }

  await writeFile(eventPath, JSON.stringify(event), 'utf8')
  process.env.GITHUB_EVENT_PATH = eventPath
}

function getPullRequestNumber() {
  const match = process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)

  if (match) {
    return Number.parseInt(match[1], 10)
  }

  const refName = process.env.GITHUB_REF_NAME ?? ''
  const refNameMatch = refName.match(/^(\d+)\//)

  if (refNameMatch) {
    return Number.parseInt(refNameMatch[1], 10)
  }

  return undefined
}

async function findCodSpeedBinary() {
  const path = await which('codspeed')

  if (path) {
    return path
  }

  await installCodSpeed()

  const installedPath = await which('codspeed', {
    PATH: buildPathWithCodSpeedInstallDirs(),
  })

  if (installedPath) {
    process.env.PATH = buildPathWithCodSpeedInstallDirs()
    return installedPath
  }

  throw new Error('Unable to find codspeed after installing the runner')
}

async function installCodSpeed() {
  const dir = await mkdtemp(join(tmpdir(), 'codspeed-runner-'))
  const installer = join(dir, 'install.sh')

  try {
    const body = await fetch(
      `https://codspeed.io/v${CODSPEED_VERSION}/install.sh`,
    )

    if (!body.ok) {
      throw new Error(
        `Failed to download CodSpeed installer: HTTP ${body.status}`,
      )
    }

    const buffer = Buffer.from(await body.arrayBuffer())
    const actualHash = createHash('sha256').update(buffer).digest('hex')

    if (actualHash !== CODSPEED_INSTALLER_SHA256) {
      throw new Error(
        `CodSpeed installer hash mismatch. Expected ${CODSPEED_INSTALLER_SHA256}, got ${actualHash}.`,
      )
    }

    await writeFile(installer, buffer, { mode: 0o755 })
    await execFile('bash', [installer, '--quiet'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function which(binary, env = process.env) {
  try {
    const { stdout } = await execFile('bash', ['-lc', `command -v ${binary}`], {
      env,
      capture: true,
    })

    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

function buildPathWithCodSpeedInstallDirs() {
  const home = process.env.HOME

  if (!home) {
    return process.env.PATH ?? ''
  }

  return [
    join(home, '.codspeed', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.local', 'bin'),
    process.env.PATH ?? '',
  ].join(':')
}

async function execFile(file, args, options = {}) {
  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  let stdout = ''
  let stderr = ''

  if (options.capture) {
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
  }

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })

  if (code !== 0) {
    const message = options.capture
      ? stderr || stdout || `${file} exited with code ${code}`
      : `${file} exited with code ${code}`
    throw new Error(message)
  }

  return { stdout, stderr }
}
