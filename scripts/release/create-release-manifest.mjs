import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * @typedef {object} PackageJson
 * @property {string} name
 * @property {string} version
 * @property {boolean=} private
 * @property {Record<string, string>=} scripts
 */

/**
 * @typedef {object} WorkspacePackage
 * @property {string} dirName
 * @property {string} path
 * @property {string} packageJsonPath
 * @property {PackageJson} packageJson
 */

/**
 * @typedef {WorkspacePackage & { previousVersion: string | null }} ReleasePackage
 */

const rootDir = path.join(import.meta.dirname, '..', '..')
const packagesDir = path.join(rootDir, 'packages')
const artifactsDir = path.join(rootDir, 'release-artifacts')
const tarballsDir = path.join(artifactsDir, 'tarballs')
const allowlistPath = path.join(import.meta.dirname, 'published-packages.json')

const blockedLifecycleScripts = [
  'prepublish',
  'prepublishOnly',
  'prepack',
  'prepare',
  'postpack',
  'publish',
  'postpublish',
]

/**
 * @template T
 * @param {string} filePath
 * @returns {T}
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * @param {Array<string>} args
 * @param {import('node:child_process').ExecFileSyncOptionsWithStringEncoding=} options
 * @returns {string}
 */
function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

/**
 * @param {string} output
 * @returns {any}
 */
function parsePackOutput(output) {
  const trimmed = output.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/)
    if (!match) throw new Error(`Unable to parse pnpm pack output:\n${output}`)
    return JSON.parse(match[1])
  }
}

/**
 * @param {string} filename
 * @param {string} packageDir
 * @returns {string}
 */
function resolvePackedTarball(filename, packageDir) {
  const candidates = []

  if (path.isAbsolute(filename)) {
    candidates.push(filename)
  } else {
    candidates.push(path.join(tarballsDir, filename))
    candidates.push(path.join(tarballsDir, path.basename(filename)))
    candidates.push(path.join(packageDir, filename))
  }

  const packedPath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!packedPath) {
    throw new Error(
      `Could not locate tarball from pnpm pack output: ${filename}`,
    )
  }

  return packedPath
}

/**
 * @returns {Array<WorkspacePackage>}
 */
function getWorkspacePackages() {
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
      if (!fs.existsSync(packageJsonPath)) return null

      const packageJson = readJson(packageJsonPath)
      if (packageJson.private) return null

      return {
        dirName: entry.name,
        path: normalizePath(
          path.relative(rootDir, path.dirname(packageJsonPath)),
        ),
        packageJsonPath,
        packageJson,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name))
}

/**
 * @param {Array<WorkspacePackage>} packages
 */
function validateAllowlist(packages) {
  const allowlist = readJson(allowlistPath)
  const workspaceByName = new Map(
    packages.map((pkg) => [pkg.packageJson.name, pkg.path]),
  )

  for (const pkg of packages) {
    const allowedPath = allowlist[pkg.packageJson.name]
    if (!allowedPath) {
      throw new Error(
        `${pkg.packageJson.name} is publishable but is missing from ${normalizePath(
          path.relative(rootDir, allowlistPath),
        )}`,
      )
    }

    if (allowedPath !== pkg.path) {
      throw new Error(
        `${pkg.packageJson.name} is allowlisted for ${allowedPath}, but package is at ${pkg.path}`,
      )
    }
  }

  for (const [packageName, packagePath] of Object.entries(allowlist)) {
    if (workspaceByName.get(packageName) !== packagePath) {
      throw new Error(
        `${packageName} is allowlisted for ${packagePath}, but no matching publishable package exists`,
      )
    }
  }
}

/**
 * @param {Array<WorkspacePackage>} packages
 */
function validateLifecycleScripts(packages) {
  const violations = []

  for (const pkg of packages) {
    const scripts = pkg.packageJson.scripts ?? {}
    for (const scriptName of blockedLifecycleScripts) {
      if (scripts[scriptName]) {
        violations.push(`${pkg.packageJson.name}: ${scriptName}`)
      }
    }
  }

  if (violations.length) {
    throw new Error(
      `Publish-blocking lifecycle scripts were found:\n${violations.join('\n')}`,
    )
  }
}

/**
 * @param {string} parentCommit
 * @param {string} packagePath
 * @returns {PackageJson | null}
 */
function getPreviousPackageJson(parentCommit, packagePath) {
  try {
    return JSON.parse(
      git(['show', `${parentCommit}:${packagePath}/package.json`]),
    )
  } catch {
    return null
  }
}

/**
 * @param {Array<WorkspacePackage>} packages
 * @param {string} parentCommit
 * @returns {Array<ReleasePackage>}
 */
function getReleasePackages(packages, parentCommit) {
  return packages
    .map((pkg) => {
      const previousPackageJson = getPreviousPackageJson(parentCommit, pkg.path)
      const previousVersion = previousPackageJson?.private
        ? null
        : previousPackageJson?.version

      if (previousVersion === pkg.packageJson.version) return null

      return {
        ...pkg,
        previousVersion,
      }
    })
    .filter(Boolean)
}

/**
 * @param {ReleasePackage} pkg
 */
function packPackage(pkg) {
  const packageDir = path.join(rootDir, pkg.path)
  const output = execFileSync(
    'pnpm',
    ['--dir', packageDir, 'pack', '--pack-destination', tarballsDir, '--json'],
    {
      cwd: rootDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        npm_config_ignore_scripts: 'true',
        PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )

  const packResult = parsePackOutput(output)
  const packRecord = Array.isArray(packResult) ? packResult[0] : packResult
  const filename = packRecord.filename ?? packRecord.name

  if (!filename) {
    throw new Error(
      `pnpm pack did not report a filename for ${pkg.packageJson.name}`,
    )
  }

  const packedPath = resolvePackedTarball(filename, packageDir)
  const tarball = path.basename(packedPath)

  return {
    name: pkg.packageJson.name,
    version: pkg.packageJson.version,
    previousVersion: pkg.previousVersion,
    path: pkg.path,
    distTag,
    tarball,
    sha256: hash('sha256', fs.readFileSync(packedPath), 'hex'),
    size: fs.statSync(packedPath).size,
  }
}

const distTag = process.env.DIST_TAG
const releaseMode = process.env.RELEASE_MODE
const hasChangesets = process.env.HAS_CHANGESETS === 'true'

if (!distTag) throw new Error('DIST_TAG is required')
if (!releaseMode) throw new Error('RELEASE_MODE is required')

const commit = git(['rev-parse', 'HEAD'])
const parentCommit = git(['rev-parse', 'HEAD^'])
const packages = getWorkspacePackages()

validateAllowlist(packages)
validateLifecycleScripts(packages)

const releasePackages = getReleasePackages(packages, parentCommit)

if (releasePackages.length > 0 && !hasChangesets) {
  throw new Error(
    'Package versions changed, but no changeset files were present',
  )
}

fs.rmSync(artifactsDir, { recursive: true, force: true })
fs.mkdirSync(tarballsDir, { recursive: true })
fs.copyFileSync(
  allowlistPath,
  path.join(artifactsDir, 'published-packages.json'),
)

const packedPackages = releasePackages.map(packPackage)

const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? null,
  workflow: process.env.GITHUB_WORKFLOW ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  ref: process.env.GITHUB_REF ?? null,
  refName: process.env.GITHUB_REF_NAME ?? null,
  releaseMode,
  distTag,
  hasChangesets,
  allowlistSha256: hash('sha256', fs.readFileSync(allowlistPath), 'hex'),
  commit,
  parentCommit,
  packageCount: packedPackages.length,
  packages: packedPackages,
}

fs.writeFileSync(
  path.join(artifactsDir, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.info(
  `Created release manifest for ${packedPackages.length} package${
    packedPackages.length === 1 ? '' : 's'
  }`,
)

for (const pkg of packedPackages) {
  console.info(`${pkg.name}@${pkg.version} -> ${pkg.tarball}`)
}
