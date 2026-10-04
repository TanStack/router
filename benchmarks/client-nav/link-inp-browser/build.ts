/**
 * Builds the apps (React, Solid, Vue) for one arm into `dist/<arm>/<framework>`.
 *
 *   node build.ts candidate
 *     Links against this checkout's packages (built by Nx beforehand).
 *   node build.ts baseline [ref]
 *     Links against `git merge-base HEAD <ref>` (default `origin/main`, or
 *     `$LINK_INP_BASELINE_REF`), checked out, installed and built in a
 *     detached worktree at `$LINK_INP_BASELINE_DIR` (default
 *     `<tmpdir>/tanstack-router-link-inp-baseline`; not under `node_modules`,
 *     where Node refuses to strip the types of the workspace's Nx plugins).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const harnessDir = import.meta.dirname
const repoRoot = resolve(harnessDir, '../../..')
const frameworks = ['react', 'solid', 'vue'] as const
const routerSources = [
  'packages/router-core/src',
  'packages/react-router/src',
  'packages/solid-router/src',
  'packages/vue-router/src',
]

function run(command: string, args: Array<string>, cwd: string) {
  console.log(`$ (${cwd}) ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: '1', NX_DAEMON: 'false' },
  })
}

function git(args: Array<string>, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function prepareBaseline(ref: string) {
  const dir = resolve(
    process.env.LINK_INP_BASELINE_DIR ??
      join(tmpdir(), 'tanstack-router-link-inp-baseline'),
  )
  const commit = git(['merge-base', 'HEAD', ref])
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(resolve(dir, '..'), { recursive: true })
    run('git', ['worktree', 'add', '--detach', dir, commit], repoRoot)
  } else {
    run('git', ['checkout', '--detach', commit], dir)
  }
  run('pnpm', ['install', '--frozen-lockfile'], dir)
  run(
    'pnpm',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      '-p',
      '@tanstack/react-router',
      '@tanstack/solid-router',
      '@tanstack/vue-router',
      '--outputStyle=stream',
      '--skipRemoteCache',
    ],
    dir,
  )
  return dir
}

function bundleHash(dir: string) {
  const hash = createHash('sha256')
  for (const file of readdirSync(join(dir, 'assets')).sort()) {
    if (file.endsWith('.js')) {
      hash.update(readFileSync(join(dir, 'assets', file)))
    }
  }
  return hash.digest('hex').slice(0, 16)
}

const arm = process.argv[2]
if (arm !== 'baseline' && arm !== 'candidate') {
  throw new Error('Usage: node build.ts <baseline|candidate> [ref]')
}
const packagesRoot =
  arm === 'baseline'
    ? prepareBaseline(
        process.argv[3] ?? process.env.LINK_INP_BASELINE_REF ?? 'origin/main',
      )
    : repoRoot

const manifest = {
  arm,
  packagesRoot,
  commit: git(['rev-parse', 'HEAD'], packagesRoot),
  // Uncommitted router sources also go into the arm; record them.
  dirtySources: git(
    ['status', '--porcelain', '--', ...routerSources],
    packagesRoot,
  ),
  builtAt: new Date().toISOString(),
  bundles: {} as Record<string, string>,
}

for (const framework of frameworks) {
  const outDir = join(harnessDir, 'dist', arm, framework)
  execFileSync(
    join(harnessDir, '../node_modules/.bin/vite'),
    ['build', '--config', join(harnessDir, 'vite.config.ts')],
    {
      cwd: join(harnessDir, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        LINK_INP_FRAMEWORK: framework,
        LINK_INP_PACKAGES_ROOT: packagesRoot,
        LINK_INP_OUT_DIR: outDir,
      },
    },
  )
  manifest.bundles[framework] = bundleHash(outDir)
}

writeFileSync(
  join(harnessDir, 'dist', arm, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest, null, 2))
