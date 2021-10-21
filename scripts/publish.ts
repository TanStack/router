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
const packageNames: string[] = ['react-location', 'react-location-simple-cache']
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

function packageJson(packageName: string, directory = 'packages') {
  return path.join(rootDir, directory, packageName, 'package.json')
}

function ensureCleanWorkingDirectory() {
  let status: string = execSync(`git status --porcelain`).toString().trim()
  let lines = status.split('\n')

  // if (!lines.every((line) => line === '' || line.startsWith('?'))) {
  //   throw new Error(
  //     'Working directory is not clean. Please commit or stash your changes.'
  //   )
  // }
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

  let tags: string[] = execSync('git tag').toString().split('\n')

  tags = tags
    .filter(semver.valid)
    .filter((tag) => {
      if (branch.prerelease) {
        return tag.includes(`-${branchName}`)
      }

      return true
    })
    .sort(semver.compare)

  const latestTag = [...tags].pop()

  // let commitsSinceLatestTag = await new Promise<string[]>((resolve, reject) =>
  //   exec(
  //     `git log ${latestTag}..HEAD`,
  //     function (err: any, stdout: any, stderr: any) {
  //       if (err) return reject(err)
  //       resolve(testCommitString.split(/^commit /gm))
  //       // return resolve(stdout.toString().split('\n').filter(Boolean))
  //     }
  //   )
  // )

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

  const recommendedReleaseLevel: number = commitsSinceLatestTag.reduce(
    (releaseLevel, commit) => {
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

  ensureCleanWorkingDirectory()

  const currentVersion = await getPackageVersion(packageNames[0])
  const version = getNextVersion(
    currentVersion,
    recommendedReleaseLevel,
    prereleaseBranch
  )

  console.log(`Bumping version from ${currentVersion} to ${version}`)

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

  // Upate example dependencies to the new version
  let examples = await fsp.readdir(examplesDir)
  for (const example of examples) {
    let stat = await fsp.stat(path.join(examplesDir, example))
    if (!stat.isDirectory()) continue

    await updateExamplesPackageConfig(example, (config) => {
      packageNames.forEach((packageName) => {
        if (config.dependencies[packageName]) {
          config.dependencies[packageName] = version
        }
      })
    })
  }

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
    console.log(`  yarn publish ${packageDir} --tag ${tag} `)
    console.log()
    execSync(
      `yarn publish ${packageDir} --tag ${tag} --token ${process.env.NPM_TOKEN}`,
      { stdio: 'inherit' }
    )
  })

  console.log(chalk.green(`  Pushing new tags to branch.`))
  execSync(`git push --tags`)
  console.log(chalk.green(`  Pushed tags to branch.`))
}

run().catch((err) => {
  console.log(err)
  process.exit(1)
})

const testCommitString = `commit da602fc487b382ca51467f4b87356fe49e840aca
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 18:14:26 2021 -0700

    fix root width

commit e1fb86c570013457760a375045f73802b7a5ea3e
Merge: 20cd3181 5362bde1
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 18:09:09 2021 -0700

    Merge branch 'dev' into beta

commit 5362bde15c7d695eff470ee49f67c1c979c53340
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 18:07:01 2021 -0700

    fix charts

commit 9d300c3a741cdccf3dfa3cd125039de30fb16242
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 15:37:03 2021 -0700

    Update inactive account banner

commit fb4498f006a797b9112c37a75b85836d23508f66
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 15:10:33 2021 -0700

    Improve single day time series

commit 6364c3b8aa13a232eadee095097d123a8deb3b2c
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 13:54:01 2021 -0700

    Update Auth.js

commit 4d21e5202cccb4c45977b309849e4f32f609727a
Merge: 547e0d78 c2f5c9d0
Author: Tanner Linsley <tannerlinsley@gmail.com>
Date:   Thu Feb 4 13:52:37 2021 -0700

    Merge pull request #778 from nozzle/fix-Billing
    
    Fixes to billing page

`
