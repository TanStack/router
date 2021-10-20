// Originally ported to TS from https://github.com/remix-run/react-router/tree/main/scripts/{version,publish}.js
const path = require('path')
const { execSync } = require('child_process')
const fsp = require('fs/promises')
const chalk = require('chalk')
const jsonfile = require('jsonfile')
const semver = require('semver')
const currentGitBranch = require('current-git-branch')
const conventionalRecommendedBump = require(`conventional-recommended-bump`)
const standardChangelog = require('standard-changelog')

//

// TODO: List your npm packages here. The first package will be used as the versioner.
const packageNames: string[] = [
  'react-location',
  // 'react-location-simple-cache'
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
  const recommendedReleaseType = await new Promise<string>((r, e) =>
    conventionalRecommendedBump(
      {
        preset: 'angular',
      },
      (err: any, version: { releaseType: string }) => {
        if (err) return e(err)
        console.log(version)
        r(version.releaseType)
      }
    )
  )

  return

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
  execSync(`git commit --all --message="Version ${version}"`)
  execSync(`git tag -a -m "Version ${version}" v${version}`)
  console.log(chalk.green(`  Committed and tagged version ${version}`))

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
}

run().catch((err) => {
  console.log(err)
  process.exit(1)
})
