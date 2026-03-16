#!/usr/bin/env node

/**
 * Preview the version bumps that `changeset version` will produce.
 *
 * Workflow:
 *   1. Snapshot every workspace package's current version
 *   2. Run `changeset version` (mutates package.json files)
 *   3. Diff against the snapshot
 *   4. Print a markdown summary (or write to --output file)
 *
 * This script is meant to run in CI on a disposable checkout — it does NOT
 * revert the changes it makes.
 */

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES_DIR = join(ROOT, 'packages')

function readPackageVersions() {
  const versions = new Map()
  for (const dir of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const pkgPath = join(PACKAGES_DIR, dir.name, 'package.json')
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.name && pkg.version && pkg.private !== true) {
        versions.set(pkg.name, pkg.version)
      }
    } catch {
      // skip packages without a valid package.json
    }
  }
  return versions
}

function readChangesetEntries() {
  const changesetDir = join(ROOT, '.changeset')
  const explicit = new Map()
  for (const file of readdirSync(changesetDir)) {
    if (file === 'config.json' || file === 'README.md' || !file.endsWith('.md'))
      continue
    const content = readFileSync(join(changesetDir, file), 'utf8')
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) continue
    for (const line of frontmatterMatch[1].split('\n')) {
      const match = line.match(/^['"]?([^'"]+)['"]?\s*:\s*(major|minor|patch)/)
      if (match) {
        const [, name, bump] = match
        const existing = explicit.get(name)
        // keep the highest bump if a package appears in multiple changesets
        if (
          !existing ||
          bumpRank(bump) > bumpRank(existing)
        ) {
          explicit.set(name, bump)
        }
      }
    }
  }
  return explicit
}

function bumpRank(bump) {
  return bump === 'major' ? 3 : bump === 'minor' ? 2 : 1
}

function bumpType(oldVersion, newVersion) {
  const [oMaj, oMin] = oldVersion.split('.').map(Number)
  const [nMaj, nMin] = newVersion.split('.').map(Number)
  if (nMaj > oMaj) return 'major'
  if (nMin > oMin) return 'minor'
  return 'patch'
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: 'string', short: 'o' },
    },
    strict: true,
    allowPositionals: false,
  })

  // 1. Read explicit changeset entries
  const explicit = readChangesetEntries()

  if (explicit.size === 0) {
    const msg = 'No changeset entries found — nothing to preview.\n'
    if (values.output) {
      writeFileSync(values.output, msg)
    } else {
      process.stdout.write(msg)
    }
    return
  }

  // 2. Snapshot current versions
  const before = readPackageVersions()

  // 3. Temporarily swap changeset config to skip changelog generation
  //    (the GitHub changelog plugin requires a token we don't need for previews)
  const configPath = join(ROOT, '.changeset', 'config.json')
  const originalConfig = readFileSync(configPath, 'utf8')
  try {
    const config = JSON.parse(originalConfig)
    config.changelog = false
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    // 4. Run changeset version
    execSync('pnpm changeset version', { cwd: ROOT, stdio: 'pipe' })
  } finally {
    // Always restore the original config
    writeFileSync(configPath, originalConfig)
  }

  // 5. Read new versions
  const after = readPackageVersions()

  // 6. Diff
  const bumps = []
  for (const [name, newVersion] of after) {
    const oldVersion = before.get(name)
    if (!oldVersion || oldVersion === newVersion) continue
    const bump = bumpType(oldVersion, newVersion)
    const source = explicit.has(name) ? explicit.get(name) : 'dependency'
    bumps.push({ name, oldVersion, newVersion, bump, source })
  }

  // Sort: major first, then minor, then patch; within each group alphabetical
  bumps.sort(
    (a, b) => bumpRank(b.bump) - bumpRank(a.bump) || a.name.localeCompare(b.name),
  )

  // 7. Build markdown
  const lines = []
  lines.push('<!-- changeset-version-preview -->')
  lines.push('## Changeset Version Preview')
  lines.push('')

  if (bumps.length === 0) {
    lines.push('No version changes detected.')
  } else {
    const explicitBumps = bumps.filter((b) => b.source !== 'dependency')
    const dependencyBumps = bumps.filter((b) => b.source === 'dependency')

    lines.push(
      `**${explicitBumps.length}** package(s) bumped directly, **${dependencyBumps.length}** bumped as dependents.`,
    )
    lines.push('')

    if (explicitBumps.length > 0) {
      lines.push('### Direct bumps')
      lines.push('')
      lines.push('| Package | Bump | Version |')
      lines.push('| --- | --- | --- |')
      for (const b of explicitBumps) {
        lines.push(
          `| \`${b.name}\` | **${b.bump}** | ${b.oldVersion} → ${b.newVersion} |`,
        )
      }
      lines.push('')
    }

    if (dependencyBumps.length > 0) {
      lines.push(
        '<details>',
        `<summary>Dependency bumps (${dependencyBumps.length})</summary>`,
        '',
        '| Package | Bump | Version |',
        '| --- | --- | --- |',
      )
      for (const b of dependencyBumps) {
        lines.push(
          `| \`${b.name}\` | ${b.bump} | ${b.oldVersion} → ${b.newVersion} |`,
        )
      }
      lines.push('', '</details>')
    }
  }

  lines.push('')

  const md = lines.join('\n')
  if (values.output) {
    writeFileSync(values.output, md)
    process.stdout.write(`Written to ${values.output}\n`)
  } else {
    process.stdout.write(md)
  }
}

main()
