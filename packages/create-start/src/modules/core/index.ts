// // The core module for creating a Tanstack Start app
// // Also calls the:
// // - ide module - to set ide specific settings
// // - packageJson module - create a packageJson file with up-to-date packages

import { z } from 'zod'
import createPackageJson from '../createPackageJson'
import { createModule } from '../../module'
import { ideModule } from '../ide'
import addDependencies from '../addDependencies'
import packageJson from '../../../package.json' assert { type: 'json' }
import packageManager from '../packageManager'
import { gitModule } from '../git'
import { initHelpers } from '../../utils/helpers'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type DepNames<
  T extends
    (typeof packageJson)['peerDependencies'] = (typeof packageJson)['peerDependencies'],
> = keyof T

const deps = async (
  depsArray: Array<DepNames>,
): Promise<
  Exclude<z.infer<typeof addDependencies._schema>['dependencies'], undefined>
> => {
  const result = await Promise.all(
    depsArray.map(async (d) => {
      let version =
        packageJson['peerDependencies'][d] === 'workspace:^'
          ? 'latest' // Use latest in development
          : packageJson['peerDependencies'][d]
      return {
        name: d,
        version: version,
      }
    }),
  )

  return result
}

export const coreModule = createModule(
  z
    .object({})
    .merge(createPackageJson._schema)
    .merge(ideModule._schema)
    .merge(packageManager._schema)
    .merge(gitModule._schema),
)
  .initFn(async ({ cfg, targetPath }) => {
    const packageManagerInit = await packageManager._init({ cfg, targetPath })

    return {
      ...packageManagerInit,
      scripts: [
        {
          name: 'dev',
          script: 'vinxi dev',
        },
        {
          name: 'build',
          script: 'vinxi build',
        },
        {
          name: 'start',
          script: 'vinxi start',
        },
      ],
      dependencies: await deps([
        '@tanstack/react-router',
        '@tanstack/start',
        'react',
        'react-dom',
        'vinxi',
      ]),
      devDependencies: await deps(['@types/react', '@types/react']),
    }
  })
  .promptFn(async ({ state, targetPath }) => {
    const createPackageJsonPrompts = await createPackageJson._prompt({
      state,
      targetPath,
    })

    const ideModulePrompts = await ideModule._prompt({ state, targetPath })
    const packageManagerPrompts = await packageManager._prompt({
      state,
      targetPath,
    })
    const gitModulePrompts = await gitModule._prompt({ state, targetPath })

    return {
      ...state,
      ...gitModulePrompts,
      ...packageManagerPrompts,
      ...createPackageJsonPrompts,
      ...ideModulePrompts,
    }
  })
  .validateFn(async ({ state, targetPath }) => {
    const _ = initHelpers(__dirname, targetPath)

    const issues = await _.getTemplateFilesThatWouldBeOverwritten({
      file: '**/*',
      templateFolder: './template',
      targetFolder: targetPath,
      overwrite: false,
    })

    issues.push(...(await ideModule._validate({ state, targetPath })))

    return issues
  })
  .applyFn(async ({ state, targetPath }) => {
    const _ = initHelpers(__dirname, targetPath)

    await _.copyTemplateFiles({
      file: '**/*',
      templateFolder: './template',
      targetFolder: '.',
      overwrite: false,
    })

    await createPackageJson._apply({ state, targetPath })
    await ideModule._apply({ state, targetPath })
    await gitModule._apply({ state, targetPath })
    await packageManager._apply({ state, targetPath })
  })
