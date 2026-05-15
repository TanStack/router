import fs from 'node:fs'
import path from 'node:path'
import { hash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

/**
 * @typedef {object} ManifestPackage
 * @property {string} name
 * @property {string} version
 * @property {string | null} previousVersion
 * @property {string} distTag
 * @property {string} tarball
 * @property {string} sha256
 * @property {number} size
 */

/**
 * @typedef {object} ReleaseManifest
 * @property {string} commit
 * @property {string} refName
 * @property {string} distTag
 * @property {number} packageCount
 * @property {Array<ManifestPackage>} packages
 */

const rootDir = path.join(import.meta.dirname, '..', '..')
const artifactsDir = path.resolve(process.argv[2] ?? 'release-artifacts')
const manifestPath = path.join(artifactsDir, 'release-manifest.json')
const tarballsDir = path.join(artifactsDir, 'tarballs')

/**
 * @template T
 * @param {string} filePath
 * @returns {T}
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * @param {string} command
 * @param {Array<string>} args
 * @param {import('node:child_process').ExecFileSyncOptionsWithStringEncoding=} options
 * @returns {string}
 */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

/**
 * @param {string} command
 * @param {Array<string>} args
 * @param {import('node:child_process').ExecFileSyncOptionsWithStringEncoding=} options
 * @returns {string}
 */
function runAllowFailure(command, args, options = {}) {
  try {
    return run(command, args, options)
  } catch (error) {
    return error.stdout?.toString().trim() ?? ''
  }
}

/**
 * @param {string} url
 * @param {string} destination
 */
async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destination, buffer)
}

/**
 * @param {string} name
 * @param {string} versionOrTag
 */
function packageSpecifier(name, versionOrTag) {
  return `${name}@${versionOrTag}`
}

/**
 * @param {string} value
 */
function codeBlock(value) {
  return `\n\`\`\`\n${value || '(no output)'}\n\`\`\`\n`
}

/** @type {ReleaseManifest} */
const manifest = readJson(manifestPath)
const lines = []
const summaryPackages = []

lines.push('# Release Tarball Review')
lines.push('')
lines.push(`- Commit: \`${manifest.commit}\``)
lines.push(`- Branch: \`${manifest.refName}\``)
lines.push(`- Dist tag: \`${manifest.distTag}\``)
lines.push(`- Packages: ${manifest.packageCount}`)
lines.push('')

for (const pkg of manifest.packages) {
  const tarballPath = path.join(tarballsDir, pkg.tarball)
  const actualSha = hash('sha256', fs.readFileSync(tarballPath), 'hex')

  if (actualSha !== pkg.sha256) {
    throw new Error(
      `${pkg.tarball} SHA256 mismatch: expected ${pkg.sha256}, got ${actualSha}`,
    )
  }

  const fileList = run('tar', ['-tzf', tarballPath])
  const fileCount = fileList ? fileList.split('\n').length : 0
  summaryPackages.push(
    `- ${pkg.name}@${pkg.version} (${fileCount} files, ${pkg.size} bytes)`,
  )

  lines.push(`## ${pkg.name}@${pkg.version}`)
  lines.push('')
  lines.push(`- Previous version: ${pkg.previousVersion ?? '(new package)'}`)
  lines.push(`- Tarball: \`${pkg.tarball}\``)
  lines.push(`- SHA256: \`${pkg.sha256}\``)
  lines.push(`- Size: ${pkg.size} bytes`)
  lines.push(`- Files: ${fileCount}`)
  lines.push('')
  lines.push('<details>')
  lines.push('<summary>Tarball files</summary>')
  lines.push(codeBlock(fileList))
  lines.push('</details>')
  lines.push('')

  let previousTarballUrl = ''
  try {
    previousTarballUrl = run('npm', [
      'view',
      packageSpecifier(pkg.name, pkg.distTag),
      'dist.tarball',
      '--silent',
    ])
  } catch {
    lines.push(
      `No existing \`${pkg.distTag}\` tarball found on npm for comparison.`,
    )
    lines.push('')
    continue
  }

  if (!previousTarballUrl) {
    lines.push(
      `No existing \`${pkg.distTag}\` tarball found on npm for comparison.`,
    )
    lines.push('')
    continue
  }

  const compareDir = fs.mkdtempSync(path.join(tmpdir(), 'release-review-'))
  const previousTarballPath = path.join(compareDir, 'previous.tgz')
  const previousDir = path.join(compareDir, 'previous')
  const proposedDir = path.join(compareDir, 'proposed')

  fs.mkdirSync(previousDir)
  fs.mkdirSync(proposedDir)

  await download(previousTarballUrl, previousTarballPath)
  run('tar', ['-xzf', previousTarballPath, '-C', previousDir])
  run('tar', ['-xzf', tarballPath, '-C', proposedDir])

  const nameStatus = runAllowFailure('git', [
    'diff',
    '--no-index',
    '--name-status',
    path.join(previousDir, 'package'),
    path.join(proposedDir, 'package'),
  ])

  const packageJsonDiff = runAllowFailure('git', [
    'diff',
    '--no-index',
    path.join(previousDir, 'package', 'package.json'),
    path.join(proposedDir, 'package', 'package.json'),
  ])

  lines.push('<details>')
  lines.push(`<summary>Changed files from npm \`${pkg.distTag}\`</summary>`)
  lines.push(codeBlock(nameStatus))
  lines.push('</details>')
  lines.push('')
  lines.push('<details>')
  lines.push('<summary>package.json diff</summary>')
  lines.push(codeBlock(packageJsonDiff))
  lines.push('</details>')
  lines.push('')
}

const markdown = `${lines.join('\n')}\n`
const reviewPath = path.join(artifactsDir, 'release-review.md')
fs.writeFileSync(reviewPath, markdown)

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '# Release Tarball Review',
      '',
      `- Commit: \`${manifest.commit}\``,
      `- Branch: \`${manifest.refName}\``,
      `- Dist tag: \`${manifest.distTag}\``,
      `- Packages: ${manifest.packageCount}`,
      '',
      '## Packages',
      '',
      ...summaryPackages,
      '',
      'Full tarball details were uploaded as the release-review artifact.',
      '',
    ].join('\n'),
  )
}

console.info(markdown)
