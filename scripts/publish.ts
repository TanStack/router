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
  if (!process.env.CI) {
    console.warn(
      `You should always run the publish script from the CI environment!`
    )
    return
  }

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

  // Get the commits since the latest tag
  let commitsSinceLatestTag = await new Promise<
    {
      subject: string
      body: string
      parsed: { header: { type: string; scope: null; subject: string } }
    }[]
  >((resolve, reject) => {
    const strm = log.parse({
      _: `${latestTag}..HEAD`,
    })
    streamToArray(strm, function (err: any, arr: any[]) {
      if (err) return reject(err)
      resolve(
        arr
          .map((d) => {
            try {
              return { ...d, parsed: parseCommit(d.subject) }
            } catch (err) {
              // not a valid commit message
              return undefined
            }
          })
          .filter(Boolean)
      )
    })
  })

  // Pares the commit messsages, log them, and determine the type of release needed
  const recommendedReleaseLevel: number = commitsSinceLatestTag.reduce(
    (releaseLevel, commit) => {
      console.log(
        commit.parsed.header.type,
        commit.parsed.header.scope,
        commit.parsed.header.subject
      )
      if (['fix', 'refactor'].includes(commit.parsed.header.type)) {
        releaseLevel = Math.max(releaseLevel, 0)
      }
      if (['feat'].includes(commit.parsed.header.type)) {
        releaseLevel = Math.max(releaseLevel, 1)
      }
      if (['feat'].includes(commit.parsed.header.type)) {
        releaseLevel = Math.max(releaseLevel, 1)
      }
      if (commit.body.includes('BREAKING CHANGE')) {
        releaseLevel = Math.max(releaseLevel, 2)
      }

      return releaseLevel
    },
    -1
  )

  if (recommendedReleaseLevel === -1) {
    console.log(
      `There have been no changes since the last release that require a new version. You're good!`
    )
    return
  }

  // TODO: This would be great to get working
  // const changelog = await new Promise(function (resolve, reject) {
  //   const chunks: Uint8Array[] = []
  //   const strm = standardChangelog({
  //     // infile: path.resolve(rootDir, 'CHANGELOG.md'),
  //     preset: 'angular',
  //     version: recommendedVersion,
  //     // lernaPackage: packageNames[0],
  //     // releaseCount: 1,
  //   })
  //   strm.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)))
  //   strm.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  //   strm.on('error', reject)
  // })

  // const currentVersion = await getPackageVersion(packageNames[0])
  const version = getNextVersion(
    latestTag,
    recommendedReleaseLevel,
    prereleaseBranch
  )

  console.log(`Bumping version from ${latestTag} to ${version}`)

  // Update each package to the new version along with any dependencies
  await Promise.all(
    packageNames.map(async (packageName) => {
      await updatePackageConfig(packageName, (config) => {
        config.version = version
        packageNames.forEach((packageName) => {
          if (config.dependencies[packageName]) {
            config.dependencies[packageName] = version
          }
        })
      })
      console.log(chalk.green(`  Updated ${packageName} to version ${version}`))
    })
  )

  // Tag and commit
  execSync(`git tag -a -m "v${version}" v${version}`)
  console.log(chalk.green(`  Tagged version ${version}`))

  let taggedVersion = getTaggedVersion()
  if (!taggedVersion) {
    throw new Error(
      'Missing the tagged release version. Something weird is afoot!'
    )
  }

  let tag = semver.prerelease(version) == null ? 'latest' : 'next'

  console.log()
  console.log(`  Publishing version ${version} to npm with tag "${tag}"`)

  // Ensure packages are up to date and ready
  await Promise.all(
    packageNames.map(async (packageName) => {
      let file = path.join(rootDir, 'packages', packageName, 'package.json')
      let json = await jsonfile.readFile(file)

      if (json.version !== version) {
        throw new Error(
          `Package ${packageName} is on version ${json.version}, but should be on ${version}`
        )
      }
    })
  )

  // Publish each package
  packageNames.map((packageName) => {
    let packageDir = path.join(rootDir, 'packages', packageName)
    console.log()
    console.log(`cd ${packageDir} && yarn publish --tag ${tag} `)
    console.log()
    execSync(
      `cd ${packageDir} && yarn publish --tag ${tag} --token ${process.env.NPM_TOKEN}`,
      { stdio: 'inherit' }
    )
  })

  console.log(chalk.green(`  Pushing new tags to branch.`))
  execSync(`git push --tags`)
  console.log(chalk.green(`  Pushed tags to branch.`))

  console.log(chalk.green(`  Resetting git working tree...`))
  execSync(`git reset --hard`)

  console.log(chalk.green(`  Updating examples dependencies...`))
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
  console.log(chalk.green(`  Updated example dependencies.`))
  execSync(`git commit -a -m "chore: update example dependencies"`)
  execSync(`git push"`)
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

async function getPackageVersion(packageName: string) {
  let file = packageJson(packageName)
  let json = await jsonfile.readFile(file)
  return json.version
}

async function updatePackageConfig(
  packageName: string,
  transform: (json: any) => void
) {
  let file = packageJson(packageName)
  let json = await jsonfile.readFile(file)
  transform(json)
  await jsonfile.writeFile(file, json, { spaces: 2 })
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

function getTaggedVersion() {
  let output = execSync('git tag --list --points-at HEAD').toString()
  return output.replace(/^v|\n+$/g, '')
}
