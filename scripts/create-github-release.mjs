// @ts-nocheck
import fs from 'fs'
import path from 'node:path'
import { globSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const rootDir = path.join(import.meta.dirname, '..')
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

// Resolve GitHub usernames from commit author emails
const usernameCache = {}
async function resolveUsername(email) {
  if (!ghToken || !email) return null
  if (usernameCache[email] !== undefined) return usernameCache[email]

  try {
    const res = await fetch(`https://api.github.com/search/users?q=${email}`, {
      headers: { Authorization: `token ${ghToken}` },
    })
    const data = await res.json()
    const login = data?.items?.[0]?.login || null
    usernameCache[email] = login
    return login
  } catch {
    usernameCache[email] = null
    return null
  }
}

// Resolve a commit hash to a "by @username" string
const authorCache = {}
async function resolveAuthorForCommit(hash) {
  if (authorCache[hash] !== undefined) return authorCache[hash]

  try {
    const email = execSync(`git log -1 --format=%ae ${hash}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    const username = await resolveUsername(email)
    const result = username ? ` by @${username}` : ''
    authorCache[hash] = result
    return result
  } catch {
    authorCache[hash] = ''
    return ''
  }
}

// Append author info to changelog lines that contain commit hashes
async function appendAuthors(content) {
  const lines = content.split('\n')
  const result = []

  for (const line of lines) {
    // Match commit hash links like [`9a4d924`](url)
    const commitMatch = line.match(/\[`([a-f0-9]{7,})`\]/)
    if (commitMatch && line.startsWith('- ')) {
      const author = await resolveAuthorForCommit(commitMatch[1])
      result.push(author ? `${line}${author}` : line)
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

// Get the previous release commit to diff against.
// This script runs right after the "ci: changeset release" commit is pushed,
// so HEAD is the release commit.
const releaseLogs = execSync(
  'git log --oneline --grep="ci: changeset release" --format=%H',
)
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)

const currentRelease = releaseLogs[0] || 'HEAD'
const previousRelease = releaseLogs[1]

// Find packages that were actually bumped by comparing versions
const packagesDir = path.join(rootDir, 'packages')
const allPkgJsonPaths = globSync('*/package.json', { cwd: packagesDir })

const bumpedPackages = []
for (const relPath of allPkgJsonPaths) {
  const fullPath = path.join(packagesDir, relPath)
  const currentPkg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
  if (currentPkg.private) continue

  // Get the version from the previous release commit
  if (previousRelease) {
    try {
      const prevContent = execSync(
        `git show ${previousRelease}:packages/${relPath}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
      )
      const prevPkg = JSON.parse(prevContent)
      if (prevPkg.version !== currentPkg.version) {
        bumpedPackages.push({
          name: currentPkg.name,
          version: currentPkg.version,
          prevVersion: prevPkg.version,
          dir: path.dirname(relPath),
        })
      }
    } catch {
      // Package didn't exist in previous release — it's new
      bumpedPackages.push({
        name: currentPkg.name,
        version: currentPkg.version,
        prevVersion: null,
        dir: path.dirname(relPath),
      })
    }
  } else {
    // No previous release — include all non-private packages
    bumpedPackages.push({
      name: currentPkg.name,
      version: currentPkg.version,
      prevVersion: null,
      dir: path.dirname(relPath),
    })
  }
}

bumpedPackages.sort((a, b) => a.name.localeCompare(b.name))

// Extract changelog entries from changeset-generated CHANGELOG.md files.
// Changesets writes entries under "## <version>" headers. We extract the
// content under the current version header for each bumped package.
let changelogMd = ''
for (const pkg of bumpedPackages) {
  const changelogPath = path.join(packagesDir, pkg.dir, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) continue

  const changelog = fs.readFileSync(changelogPath, 'utf-8')

  // Find the section for the current version: starts with "## <version>"
  // and ends at the next "## " or end of file
  const versionHeader = `## ${pkg.version}`
  const startIdx = changelog.indexOf(versionHeader)
  if (startIdx === -1) continue

  const afterHeader = startIdx + versionHeader.length
  const nextSection = changelog.indexOf('\n## ', afterHeader)
  const section =
    nextSection === -1
      ? changelog.slice(afterHeader)
      : changelog.slice(afterHeader, nextSection)

  const content = section.trim()
  if (content) {
    const withAuthors = await appendAuthors(content)
    changelogMd += `#### ${pkg.name}\n\n${withAuthors}\n\n`
  }
}

if (!changelogMd) {
  changelogMd = '- No changelog entries\n\n'
}

const now = new Date()
const date = now.toISOString().slice(0, 10)
const time = now.toISOString().slice(11, 16).replace(':', '')
const tagName = `release-${date}-${time}`
const titleDate = `${date} ${now.toISOString().slice(11, 16)}`

const isPrerelease = process.argv.includes('--prerelease')

const body = `Release ${titleDate}

## Changes

${changelogMd}
## Packages

${bumpedPackages.map((p) => `- ${p.name}@${p.version}`).join('\n')}
`

// Create the release
// Check if tag already exists — if so, try to create the release for it
// (handles retries where the tag was pushed but release creation failed)
let tagExists = false
try {
  execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' })
  tagExists = true
} catch {
  // Tag doesn't exist yet
}

if (!tagExists) {
  execSync(`git tag -a -m "${tagName}" ${tagName}`)
  execSync('git push --tags')
}

const prereleaseFlag = isPrerelease ? '--prerelease' : ''
const latestFlag = isPrerelease ? '' : ' --latest'
const tmpFile = path.join(tmpdir(), `release-notes-${tagName}.md`)
fs.writeFileSync(tmpFile, body)

try {
  execSync(
    `gh release create ${tagName} ${prereleaseFlag} --title "Release ${titleDate}" --notes-file ${tmpFile}${latestFlag}`,
    { stdio: 'inherit' },
  )
  console.info(`GitHub release ${tagName} created.`)
} catch (err) {
  // Clean up the tag if we created it but release failed
  if (!tagExists) {
    console.info(`Release creation failed, cleaning up tag ${tagName}...`)
    try {
      execSync(`git push --delete origin ${tagName}`, { stdio: 'ignore' })
      execSync(`git tag -d ${tagName}`, { stdio: 'ignore' })
    } catch {
      // Best effort cleanup
    }
  }
  throw err
} finally {
  fs.unlinkSync(tmpFile)
}
