#!/usr/bin/env node
/**
 * Runs a script of an e2e project in a copy whose `@tanstack/*` dependencies
 * are installed the way a user's package manager installs them, instead of
 * being links to `packages/*`. `run-as-installed.md` explains why a project
 * needs this and what the copy is.
 *
 * Usage, from the e2e project's directory:
 *
 *   node ../../../scripts/e2e/run-as-installed.mjs [--keep] <script>
 *
 * `--keep` leaves the copy in place and prints where it is.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const keep = args[0] === '--keep'
if (keep) {
  args.shift()
}
const [script] = args
if (!script) {
  console.error(
    'Usage: node scripts/e2e/run-as-installed.mjs [--keep] <script>',
  )
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const projectName = packageJson.name
const tanstackDependencies = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
}).filter((name) => name.startsWith('@tanstack/'))

// The copy lives outside the repository. From a directory inside it, Node and
// Vite would walk up to the repository's own `node_modules` and workspace
// root, and a package the project does not depend on would resolve anyway.
const directory = realpathSync(
  mkdtempSync(path.join(tmpdir(), 'tanstack-installed-')),
)
const copy = path.join(directory, 'project')

function pnpm(pnpmArgs, options = {}) {
  const spawnOptions = { stdio: 'inherit', ...options }
  // `pnpm` is a `.cmd` file on Windows, which only a shell starts. Node joins
  // the arguments of a shell command with spaces and does not quote them, so
  // an argument with a space in it, such as the copy under a temporary
  // directory of "Jane Doe", is quoted here.
  const result =
    process.platform === 'win32'
      ? spawnSync(
          ['pnpm', ...pnpmArgs]
            .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
            .join(' '),
          { ...spawnOptions, shell: true },
        )
      : spawnSync('pnpm', pnpmArgs, spawnOptions)
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

/**
 * Fails unless every `@tanstack/*` dependency of the project is a package
 * inside the copy. If a change to pnpm's settings or to how `deploy` works
 * left a link back into `packages/*`, the run would be a linked one again,
 * and it would pass without testing what this script is for.
 */
function assertInstalled() {
  const nodeModules = path.join(copy, 'node_modules')
  for (const name of tanstackDependencies) {
    const location = realpathSync(path.join(nodeModules, name))
    if (!location.startsWith(nodeModules + path.sep)) {
      throw new Error(
        `${name} is not installed in the copy: it resolves to ${location}. The run would test the linked workspace package.`,
      )
    }
    console.log(`${name}: installed in the copy`)
  }
}

let status = 1
try {
  // `pnpm deploy` copies the project and installs its dependencies into the
  // copy from the workspace's lockfile. A workspace package is packed as for
  // publishing and installed like a package from the registry.
  status = pnpm(['--filter', projectName, 'deploy', copy])
  if (status === 0) {
    assertInstalled()
    status = pnpm(['run', script], { cwd: copy })
  }
} finally {
  if (keep) {
    console.log(`The installed copy is kept at ${copy}`)
  } else {
    rmSync(directory, { recursive: true, force: true })
  }
}
process.exit(status)
