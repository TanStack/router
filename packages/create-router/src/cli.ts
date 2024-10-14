import { basename, resolve } from 'node:path'
import { Command, InvalidArgumentError } from 'commander'
import {
  NAME,
  SUPPORTED_BUNDLERS,
  SUPPORTED_IDES,
  SUPPORTED_PACKAGE_MANAGERS,
} from './constants'
import { validateProjectName } from './utils/validateProjectName'
import { getPackageManager } from './utils/getPackageManager'
import { packageJson } from './utils/packageJson'
import type { Bundler, Ide, PackageManager } from './constants'

let directory: string | undefined

export const command = new Command(NAME)
  .version(
    packageJson.version,
    '-v, --version',
    `Output the current version of ${NAME}.`,
  )
  .argument('[directory]')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option<PackageManager>(
    `--package-manager <${SUPPORTED_PACKAGE_MANAGERS.join('|')}>`,
    `Explicitly tell the CLI to use this package manager`,
    (value) => {
      if (!SUPPORTED_PACKAGE_MANAGERS.includes(value as PackageManager)) {
        throw new InvalidArgumentError(
          `Invalid package manager: ${value}. Only the following are allowed: ${SUPPORTED_PACKAGE_MANAGERS.join(', ')}`,
        )
      }
      return value as PackageManager
    },
    getPackageManager(),
  )
  .option<Bundler>(
    `--bundler <${SUPPORTED_BUNDLERS.join('|')}>`,
    `use this bundler (${SUPPORTED_BUNDLERS.join(', ')})`,
    (value) => {
      if (!SUPPORTED_BUNDLERS.includes(value as Bundler)) {
        throw new InvalidArgumentError(
          `Invalid bundler: ${value}. Only the following are allowed: ${SUPPORTED_BUNDLERS.join(', ')}`,
        )
      }
      return value as Bundler
    },
  )
  .option<Ide>(
    `--ide <${SUPPORTED_IDES.join('|')}>`,
    `use this IDE (${SUPPORTED_IDES.join(', ')})`,
    (value) => {
      if (!SUPPORTED_IDES.includes(value as Ide)) {
        throw new InvalidArgumentError(
          `Invalid IDE: ${value}. Only the following are allowed: ${SUPPORTED_IDES.join(', ')}`,
        )
      }
      return value as Ide
    },
  )
  .option(
    '--open-project',
    'Open the generated project in the IDE after creation. This requires option --ide to be set.',
    false,
  )
  .option(
    '--skip-install',
    'Explicitly tell the CLI to skip installing packages.',
    false,
  )
  .option(
    '--skip-build',
    'Explicitly tell the CLI to skip building the newly generated project.',
    false,
  )
  .action((name) => {
    if (typeof name === 'string') {
      name = name.trim()
    }
    if (name) {
      const validation = validateProjectName(basename(resolve(name)))
      if (!validation.valid) {
        throw new InvalidArgumentError(
          `Invalid project name: ${validation.problems[0]}`,
        )
      }
      directory = name
    }
  })
  .parse()

const options = command.opts<{
  packageManager: PackageManager | undefined
  bundler: Bundler | undefined
  ide: Ide | undefined
  skipInstall: boolean
  skipBuild: boolean
  openProject: boolean
}>()

export const cli = { options, args: command.args, directory }
