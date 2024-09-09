import { mkdir } from 'node:fs/promises'
import yoctoSpinner from 'yocto-spinner'
import colors from 'picocolors'
import { apply as applyCore } from './core'
import { apply as applyBundler } from './bundler'
import { getDependenciesWithVersion } from './utils/getPeerDependencyVersion'
import { writeTemplateFile } from './utils/writeTemplateFile'
import { build, install } from './utils/runPackageManagerCommand'
import type { Bundler, PackageManager } from './constants'
import type { PeerDependency } from './types'

interface GeneratePackageJsonParams {
  name: string
  scripts: Record<string, string>
  devDependencies: Array<PeerDependency>
  dependencies: Array<PeerDependency>
  overrides?: Partial<
    Record<PeerDependency, Partial<Record<PeerDependency, string>>>
  >
}
function generatePackageJson({
  name,
  scripts,
  dependencies,
  devDependencies,
  overrides,
}: GeneratePackageJsonParams) {
  return {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts,
    devDependencies: getDependenciesWithVersion(devDependencies),
    dependencies: getDependenciesWithVersion(dependencies),
    overrides,
  }
}

export interface CreateParams {
  targetFolder: string
  projectName: string
  skipInstall: boolean
  skipBuild: boolean
  bundler: Bundler
  packageManager: PackageManager
}
export async function create({
  targetFolder,
  projectName,
  skipInstall,
  skipBuild,
  bundler,
  packageManager,
}: CreateParams) {
  const originalCwd = process.cwd()
  await mkdir(targetFolder, { recursive: true })
  process.chdir(targetFolder)

  const coreResult = await applyCore({ targetFolder })
  const bundlerResult = await applyBundler(bundler, { targetFolder })

  const packageJson = generatePackageJson({
    name: projectName,
    scripts: { ...coreResult.scripts, ...bundlerResult.scripts },
    dependencies: coreResult.dependencies,
    devDependencies: [
      ...coreResult.devDependencies,
      ...bundlerResult.devDependencies,
    ],
    overrides: bundlerResult.overrides,
  })

  await writeTemplateFile('package.json', targetFolder, packageJson)

  if (skipInstall) {
    console.log(
      `${colors.green('Success')} Created ${projectName} at ${targetFolder}`,
    )
    return
  }
  const installSpinner = yoctoSpinner({text: 'installing dependencies'}).start()
  try {
    await install(packageManager)
    installSpinner.success('dependencies installed')
  } catch (e) {
    console.error(e)
    installSpinner.error('failed to install dependencies')
    process.exit(1)
  }

  if (skipBuild) {
    console.log(
      `${colors.green('Success')} Created ${projectName} at ${targetFolder}`,
    )
    return
  }

  const buildSpinner = yoctoSpinner({text: 'building project'}).start()
  try {
    await build(packageManager)
    buildSpinner.success('dependencies installed')
  } catch (e) {
    console.error(e)
    buildSpinner.error('failed to build project')
    process.exit(1)
  }

  console.log(
    `${colors.green('Success')} Created ${projectName} at ${targetFolder}`,
  )
  console.log()
  const needsCd = originalCwd !== targetFolder
  if (needsCd) {
    console.log('now go to your project using:')
    console.log(colors.cyan(`  cd ${targetFolder}`))
    console.log()
  }
  console.log(`${needsCd ? 'then ' : ''}start the development server via:`)
  console.log(colors.cyan(`  ${packageManager} run dev`))
  console.log()
}
