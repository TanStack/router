// Originally ported to TS from https://github.com/remix-run/react-router/tree/main/scripts/version.js

const path = require('path')
const { execSync } = require('child_process')
const fsp = require('fs/promises')
const chalk = require('chalk')
const promptConfirm = require('prompt-confirm')
const jsonfile = require('jsonfile')
const semver = require('semver')

//

// The first package will be used as the versioner
const packageNames: [string, string[]][] = [
  ['react-location', []],
  ['react-location-simple-cache', []],
]

const rootDir = path.resolve(__dirname, '..')
const examplesDir = path.resolve(rootDir, 'examples')

function packageJson(packageName: string, directory = 'packages') {
  return path.join(rootDir, directory, packageName, 'package.json')
}

function ensureCleanWorkingDirectory() {
  let status: string = execSync(`git status --porcelain`).toString().trim()
  let lines = status.split('\n')

  if (!lines.every((line) => line === '' || line.startsWith('?'))) {
    throw new Error(
      'Working directory is not clean. Please commit or stash your changes.'
    )
  }
}

function getNextVersion(
  currentVersion: string,
  givenVersion: string,
  prereleaseId: string
) {
  if (!(givenVersion != null)) {
    throw new Error(
      `Missing next version. Usage: node version.js [nextVersion]`
    )
  }

  if (/^pre/.test(givenVersion)) {
    if (prereleaseId == null) {
      throw new Error(
        `Missing prerelease id. Usage: node version.js ${givenVersion} [prereleaseId]`
      )
    }
  }

  let nextVersion = semver.inc(currentVersion, givenVersion, prereleaseId)

  if (!nextVersion) {
    throw new Error(`Invalid version specifier: ${givenVersion}`)
  }

  return nextVersion
}

async function prompt(question: string) {
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
  try {
    let args = process.argv.slice(2)
    let givenVersion = args[0]
    let prereleaseId = args[1]

    ensureCleanWorkingDirectory()

    let currentVersion = await getPackageVersion(packageNames[0][0])
    let version = semver.valid(givenVersion)
    if (version == null) {
      version = getNextVersion(currentVersion, givenVersion, prereleaseId)
    }

    let answer = await prompt(
      `Are you sure you want to bump version ${currentVersion} to ${version}? [Yn] `
    )

    if (answer === false) return 0

    // Update each package to the new version along with any dependencies
    await Promise.all(
      packageNames.map(async ([packageName, packageDependencies], index) => {
        await updatePackageConfig(packageName, (config) => {
          config.version = version
          if (packageDependencies.length) {
            packageDependencies.forEach((packageDependency) => {
              config.dependencies[packageDependency] = version
            })
          }
        })
        console.log(
          chalk.green(`  Updated ${packageName} to version ${version}`)
        )
      })
    )

    // Upate example dependencies to the new version
    let examples = await fsp.readdir(examplesDir)
    for (const example of examples) {
      let stat = await fsp.stat(path.join(examplesDir, example))
      if (!stat.isDirectory()) continue

      await updateExamplesPackageConfig(example, (config) => {
        packageNames.forEach(([packageName]) => {
          if (config.dependencies[packageName]) {
            config.dependencies[packageName] = version
          }
        })
      })
    }

    execSync(`git commit --all --message="Version ${version}"`)
    execSync(`git tag -a -m "Version ${version}" v${version}`)
    console.log(chalk.green(`  Committed and tagged version ${version}`))
  } catch (error: any) {
    console.log()
    console.error(chalk.red(`  ${error.message}`))
    console.log()
    return 1
  }

  return 0
}

run().then((code) => {
  process.exit(code)
})
