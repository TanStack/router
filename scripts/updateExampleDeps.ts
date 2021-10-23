// Originally ported to TS from https://github.com/remix-run/react-router/tree/main/scripts/{version,publish}.js
const path = require('path')
const { exec, execSync } = require('child_process')
const fsp = require('fs/promises')
const chalk = require('chalk')
const jsonfile = require('jsonfile')
const semver = require('semver')
const currentGitBranch = require('current-git-branch')
const conventionalRecommendedBump = require(`conventional-recommended-bump`)
const standardChangelog = require('standard-changelog')
const { parseCommit } = require('parse-commit-message')
const log = require('git-log-parser')
const streamToArray = require('stream-to-array')

//

// TODO: List your npm packages here. The first package will be used as the versioner.
const packageNames: string[] = [
  'react-location',
  'react-location-simple-cache',
  'react-location-rank-routes',
]

const branches: Record<string, { prerelease: boolean; tag: string }> = {
  main: {
    tag: 'latest',
    prerelease: false,
  },
  next: {
    tag: 'next',
    prerelease: true,
  },
  beta: {
    tag: 'beta',
    prerelease: true,
  },
}

const rootDir = path.resolve(__dirname, '..')
const examplesDir = path.resolve(rootDir, 'examples')

async function run() {
  const branchName: string = currentGitBranch()
  const branch = branches[branchName]
  const prereleaseBranch = branch.prerelease ? branchName : undefined

  // Get tags
  let tags: string[] = execSync('git tag').toString().split('\n')

  // Filter tags to our branch/pre-release combo
  tags = tags
    .filter(semver.valid)
    .filter((tag) => {
      if (branch.prerelease) {
        return tag.includes(`-${branchName}`)
      }
      return true
    })
    // sort by latest
    .sort(semver.compare)

  // Get the latest tag
  const latestTag = [...tags].pop()

  if (!latestTag) {
    throw new Error(
      'Could not find latest tag! Maybe make a manual release tag of v0.0.1 fist, then try again?'
    )
  }

  // Upate example dependencies to the new version
  let examples = await fsp.readdir(examplesDir)
  for (const example of examples) {
    let stat = await fsp.stat(path.join(examplesDir, example))
    if (!stat.isDirectory()) continue

    await updateExamplesPackageConfig(example, (config) => {
      packageNames.forEach((packageName) => {
        if (config.dependencies[packageName]) {
          config.dependencies[packageName] = latestTag.substring(1)
        }
      })
    })
  }
}

run().catch((err) => {
  console.log(err)
  process.exit(1)
})

function packageJson(packageName: string, directory = 'packages') {
  return path.join(rootDir, directory, packageName, 'package.json')
}

function getNextVersion(
  currentVersion: string,
  recommendedReleaseLevel: number,
  prereleaseBranch?: string
) {
  const releaseType = prereleaseBranch
    ? 'prerelease'
    : { 0: 'patch', 1: 'minor', 2: 'major' }[recommendedReleaseLevel]

  if (!releaseType) {
    throw new Error(
      `Invalid release brand: ${prereleaseBranch} or level: ${recommendedReleaseLevel}`
    )
  }

  let nextVersion = semver.inc(currentVersion, releaseType, prereleaseBranch)

  if (!nextVersion) {
    throw new Error(
      `Invalid version increment: ${JSON.stringify({
        currentVersion,
        recommendedReleaseLevel,
        prereleaseBranch,
      })}`
    )
  }

  return nextVersion
}

async function updateExamplesPackageConfig(
  example: string,
  transform: (json: any) => void
) {
  let file = packageJson(example, 'examples')
  let json = await jsonfile.readFile(file)
  transform(json)
  await jsonfile.writeFile(file, json, { spaces: 2 })
}
