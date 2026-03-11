// @ts-nocheck
import fs from 'fs'
import path from 'node:path'
import { globSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const rootDir = path.join(import.meta.dirname, '..')
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

// Get the previous release commit to diff against
const lastReleaseHash = execSync(
  'git log --oneline --grep="ci: changeset release" -n 1 --format=%H HEAD~1',
)
  .toString()
  .trim()

const rangeFrom = lastReleaseHash || 'HEAD~1'

// Get commits since last release (include author email for username lookup)
const rawLog = execSync(
  `git log ${rangeFrom}..HEAD~1 --pretty=format:"%h %ae %s" --no-merges`,
)
  .toString()
  .trim()

const commits = rawLog
  .split('\n')
  .filter(Boolean)
  .filter((line) => !line.includes('ci: changeset release'))

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

// Group commits by type
const groups = {}
for (const line of commits) {
  const match = line.match(/^(\w+)\s+(\S+)\s+(\w+)(?:\(([^)]+)\))?:\s*(.+)$/)
  if (match) {
    const [, hash, email, type, scope, subject] = match
    const key = type.charAt(0).toUpperCase() + type.slice(1)
    if (!groups[key]) groups[key] = []
    groups[key].push({ hash, email, scope, subject })
  } else {
    if (!groups['Other']) groups['Other'] = []
    const spaceIdx = line.indexOf(' ')
    const rest = line.slice(spaceIdx + 1)
    const spaceIdx2 = rest.indexOf(' ')
    groups['Other'].push({
      hash: line.slice(0, spaceIdx),
      email: rest.slice(0, spaceIdx2),
      scope: null,
      subject: rest.slice(spaceIdx2 + 1),
    })
  }
}

// Build changelog markdown
const typeOrder = [
  'Feat',
  'Fix',
  'Refactor',
  'Perf',
  'Test',
  'Docs',
  'Chore',
  'Ci',
  'Other',
]
const typeIndex = (t) => {
  const i = typeOrder.indexOf(t)
  return i === -1 ? 99 : i
}
const sortedTypes = Object.keys(groups).sort(
  (a, b) => typeIndex(a) - typeIndex(b),
)

let changelogMd = ''
for (const type of sortedTypes) {
  changelogMd += `### ${type}\n\n`
  for (const { hash, email, scope, subject } of groups[type]) {
    const scopeStr = scope ? `${scope}: ` : ''
    const username = await resolveUsername(email)
    const authorStr = username ? ` by @${username}` : ''
    changelogMd += `- ${scopeStr}${subject} (${hash})${authorStr}\n`
  }
  changelogMd += '\n'
}

if (!changelogMd) {
  changelogMd = '- None\n\n'
}

// Collect all publishable package versions
const packagesDir = path.join(rootDir, 'packages')
const pkgs = globSync('*/package.json', { cwd: packagesDir })
  .map((p) => JSON.parse(fs.readFileSync(path.join(packagesDir, p), 'utf-8')))
  .filter((p) => !p.private)
  .sort((a, b) => a.name.localeCompare(b.name))

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

${pkgs.map((p) => `- ${p.name}@${p.version}`).join('\n')}
`

// Create the release
// Check if tag already exists
try {
  execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' })
  console.info(`Tag ${tagName} already exists, skipping release creation.`)
  process.exit(0)
} catch {
  // Tag doesn't exist, proceed
}

execSync(`git tag -a -m "${tagName}" ${tagName}`)
execSync('git push --tags')

const prereleaseFlag = isPrerelease ? '--prerelease' : ''
const tmpFile = path.join(tmpdir(), `release-notes-${tagName}.md`)
fs.writeFileSync(tmpFile, body)

try {
  execSync(
    `gh release create ${tagName} ${prereleaseFlag} --title "Release ${titleDate}" --notes-file ${tmpFile} --latest`,
    { stdio: 'inherit' },
  )
  console.info(`GitHub release ${tagName} created.`)
} finally {
  fs.unlinkSync(tmpFile)
}
