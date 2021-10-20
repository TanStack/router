// Originally ported to TS from https://github.com/remix-run/react-router/tree/main/scripts/version.js
require('source-map-support')
const path = require('path')
const { execSync } = require('child_process')
const fsp = require('fs/promises')
const chalk = require('chalk')
const promptConfirm = require('prompt-confirm')
const jsonfile = require('jsonfile')
const semver = require('semver')
const branchName = require('current-git-branch')
const conventionalRecommendedBump = require(`conventional-recommended-bump`)
const standardChangelog = require('standard-changelog')

//

// TODO: List your npm packages here. The first package will be used as the versioner.
const packageNames: string[] = ['react-location', 'react-location-simple-cache']
const branches: Record<string, { prerelease?: boolean }> = {
  main: {},
  next: {
    prerelease: true,
  },
  beta: {
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
  recommendedReleaseType: string,
  prereleaseBranch?: string
) {
  console.log({
    currentVersion,
    recommendedReleaseType,
    prereleaseBranch,
  })

  if (!recommendedReleaseType) {
    throw new Error(`Missing next version.`)
  }

  let nextVersion = semver.inc(
    currentVersion,
    prereleaseBranch ? 'prerelease' : recommendedReleaseType,
    prereleaseBranch
  )

  if (!nextVersion) {
    throw new Error(
      `Invalid version increment: ${JSON.stringify({
        currentVersion,
        recommendedReleaseType,
        prereleaseBranch,
      })}`
    )
  }

  return nextVersion
}

async function prompt(question: string, fallback: boolean): Promise<boolean> {
  if (process.env.CI) {
    return fallback
  }
  let confirm = new promptConfirm(question)
  let answer = await confirm.run()
  return answer
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

async function run() {
  const branch: string = branchName()
  const prereleaseBranch = branches[branch].prerelease ? branch : undefined
  const recommendedReleaseType = await new Promise<string>((r, e) =>
    conventionalRecommendedBump(
      {
        preset: 'angular',
      },
      (err: any, version: { releaseType: string }) => {
        if (err) return e(err)
        r(version.releaseType)
      }
    )
  )

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
    recommendedReleaseType,
    prereleaseBranch
  )

  let answer = await prompt(
    `Are you sure you want to bump version ${currentVersion} to ${version}? [Yn] `,
    true
  )

  if (!answer) {
    return
  }

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

  execSync(`git commit --all --message="Version ${version}"`)
  execSync(`git tag -a -m "Version ${version}" v${version}`)
  console.log(chalk.green(`  Committed and tagged version ${version}`))
}

run().catch((err) => {
  console.log(err)
  process.exit(1)
})
