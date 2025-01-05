import { basename, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { confirm, input, select } from '@inquirer/prompts'
import { cli } from './cli'
import {
  DEFAULT_BUNDLER,
  DEFAULT_IDE,
  DEFAULT_PACKAGE_MANAGER,
  SUPPORTED_BUNDLERS,
  SUPPORTED_IDES,
  SUPPORTED_PACKAGE_MANAGERS,
} from './constants'
import { validateProjectName } from './utils/validateProjectName'
import { create } from './create'
import { isEmptyDirectory } from './utils/isEmptyDirectory'

async function main() {
  // project cannot be built if packages are not installed
  if (cli.options.skipInstall === true) {
    cli.options.skipInstall = true
  }

  if (!cli.options.packageManager) {
    cli.options.packageManager = await select({
      message: 'Select a package manager',
      choices: SUPPORTED_PACKAGE_MANAGERS.map((pm) => ({ value: pm })),
      default: DEFAULT_PACKAGE_MANAGER,
    })
  }

  if (!cli.directory) {
    cli.directory = await input({
      message: 'Enter the project name',
      default: 'my-router-app',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)))
        if (validation.valid) {
          return true
        }
        return 'Invalid project name: ' + validation.problems[0]
      },
    })
  }

  do {
    if (!cli.options.bundler) {
      cli.options.bundler = await select({
        message: 'Select a bundler',
        choices: SUPPORTED_BUNDLERS.map((bundler) => ({ value: bundler })),
        default: DEFAULT_BUNDLER,
      })
    }

    if (cli.options.bundler !== 'vite') {
      const bundlerConfirmed = await confirm({
        message:
          'Are you sure you want to use this bundler? If you ever choose to adopt full-stack features with Start, Vite is currently required. Proceed anyway?',
      })
      if (!bundlerConfirmed) {
        cli.options.bundler = undefined
      }
    }
  } while (cli.options.bundler === undefined)

  if (!cli.options.ide) {
    cli.options.ide = await select({
      message: 'Select an IDE',
      choices: SUPPORTED_IDES.map((ide) => ({ value: ide })),
      default: DEFAULT_IDE,
    })
  }

  if (cli.options.ide === 'other') {
    cli.options.openProject = false
  } else {
    cli.options.openProject = await confirm({
      message: `Open the generated project using ${cli.options.ide} after creation?`,
      default: true,
    })
  }
  const targetFolder = resolve(cli.directory)
  const projectName = basename(targetFolder)

  if (existsSync(targetFolder) && !(await isEmptyDirectory(targetFolder))) {
    const dir =
      cli.directory === '.'
        ? 'Current directory'
        : `Target directory "${targetFolder}"`
    const message = `${dir} is not empty. Please choose how to proceed:`
    const action = await select({
      message,
      choices: [
        { name: 'Cancel', value: 'cancel' },
        { name: 'Ignore files and continue', value: 'ignore' },
      ],
    })
    if (action === 'cancel') {
      process.exit(1)
    }
  }

  await create({
    targetFolder,
    projectName,
    skipInstall: cli.options.skipInstall,
    skipBuild: cli.options.skipBuild,
    packageManager: cli.options.packageManager,
    bundler: cli.options.bundler,
    ide: cli.options.ide,
    openProject: cli.options.openProject,
  })
}

main().catch(console.error)
