import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * @typedef {object} ManifestPackage
 * @property {string} name
 * @property {string} version
 */

/**
 * @typedef {object} ReleaseManifest
 * @property {number} packageCount
 * @property {string} commit
 * @property {Array<ManifestPackage>} packages
 */

const rootDir = path.join(import.meta.dirname, '..', '..')
const manifestPath = path.resolve(
  process.argv[2] ?? 'release-artifacts/release-manifest.json',
)
/** @type {ReleaseManifest} */
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

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
 * @param {Array<string>} args
 */
function gitInherited(args) {
  execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: 'inherit',
  })
}

/**
 * @param {Array<string>} args
 */
function gitPush(args) {
  const token = process.env.GITHUB_TOKEN

  if (token) {
    gitInherited([
      '-c',
      `http.https://github.com/.extraheader=AUTHORIZATION: bearer ${token}`,
      'push',
      ...args,
    ])
    return
  }

  gitInherited(['push', ...args])
}

/**
 * @param {string} tagName
 */
function remoteTagExists(tagName) {
  return Boolean(git(['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`]))
}

if (manifest.packageCount === 0) {
  console.info('No package tags to create.')
  process.exit(0)
}

gitInherited(['config', 'user.name', 'github-actions[bot]'])
gitInherited([
  'config',
  'user.email',
  'github-actions[bot]@users.noreply.github.com',
])

const createdTags = []

for (const pkg of manifest.packages) {
  const tagName = `${pkg.name}@${pkg.version}`

  if (remoteTagExists(tagName)) {
    console.info(`Tag ${tagName} already exists; skipping.`)
    continue
  }

  gitInherited(['tag', '-a', tagName, '-m', tagName, manifest.commit])
  createdTags.push(tagName)
}

if (createdTags.length === 0) {
  console.info('No new package tags to push.')
  process.exit(0)
}

gitPush(['origin', ...createdTags.map((tagName) => `refs/tags/${tagName}`)])
