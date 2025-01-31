import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { packageJsonModule } from '../packageJson'
import { createModule, runWithSpinner } from '../../module'
import { ideModule } from '../ide'
import { packageManagerModule } from '../packageManager'
import { initHelpers } from '../../utils/helpers'
import { gitModule } from '../git'
import { createDebugger } from '../../utils/debug'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const createStartPackageJson = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'),
    'utf8',
  ),
)

const debug = createDebugger('core-module')

export const coreModule = createModule(
  z.object({
    packageJson: packageJsonModule._initSchema.optional(),
    ide: ideModule._initSchema.optional(),
    packageManager: packageManagerModule._initSchema.optional(),
    git: gitModule._initSchema.optional(),
  }),
)
  .init((schema) =>
    schema.transform(async (vals, ctx) => {
      debug.verbose('Initializing core module schema', { vals })

      const gitignore: z.infer<typeof gitModule._initSchema>['gitIgnore'] = [
        {
          sectionName: 'Dependencies',
          lines: ['node_modules/'],
        },
        {
          sectionName: 'Env',
          lines: [
            '.env',
            '.env.local',
            '.env.development',
            '.env.test',
            '.env.production',
            '.env.staging',
          ],
        },
        {
          sectionName: 'System Files',
          lines: ['.DS_Store', 'Thumbs.db'],
        },
      ]

      vals.git = {
        ...vals.git,
        gitIgnore: [...(vals.git?.gitIgnore ?? []), ...gitignore],
      }

      const packageJson: z.infer<typeof packageJsonModule._initSchema> = {
        type: 'new',
        dependencies: await deps([
          '@tanstack/react-router',
          '@tanstack/start',
          'react',
          'react-dom',
          'vinxi',
        ]),
        devDependencies: await deps(['@types/react', '@types/react']),
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
        ...vals.packageJson,
      }

      debug.verbose('Parsing package manager schema')
      const packageManager =
        await packageManagerModule._initSchema.safeParseAsync(
          vals.packageManager,
          {
            path: ['packageManager'],
          },
        )

      debug.verbose('Parsing IDE schema')
      const ide = await ideModule._initSchema.safeParseAsync(vals.ide, {
        path: ['ide'],
      })

      debug.verbose('Parsing git schema')
      const git = await gitModule._initSchema.safeParseAsync(vals.git, {
        path: ['git'],
      })

      if (!ide.success || !packageManager.success || !git.success) {
        debug.error('Schema validation failed', null, {
          ide: ide.success,
          packageManager: packageManager.success,
          git: git.success,
        })
        ide.error?.issues.forEach((i) => ctx.addIssue(i))
        packageManager.error?.issues.forEach((i) => ctx.addIssue(i))
        git.error?.issues.forEach((i) => ctx.addIssue(i))
        throw Error('Failed validation')
      }

      debug.verbose('Schema transformation complete')
      return {
        ...vals,
        packageManager: packageManager.data,
        ide: ide.data,
        git: git.data,
        packageJson,
      }
    }),
  )
  .prompt((schema) =>
    schema.transform(async (vals, ctx) => {
      debug.verbose('Running prompt transformations', { vals })

      debug.verbose('Parsing IDE prompt schema')
      const ide = await ideModule._promptSchema.safeParseAsync(vals.ide, {
        path: ['ide'],
      })

      debug.verbose('Parsing package manager prompt schema')
      const packageManager =
        await packageManagerModule._promptSchema.safeParseAsync(
          vals.packageManager,
          { path: ['packageManager'] },
        )

      debug.verbose('Parsing git prompt schema')
      const git = await gitModule._promptSchema.safeParseAsync(vals.git, {
        path: ['git'],
      })

      debug.verbose('Parsing package.json prompt schema')
      const packageJson = await packageJsonModule._promptSchema.safeParseAsync(
        vals.packageJson,
        {
          path: ['packageJson'],
        },
      )

      if (
        !ide.success ||
        !packageManager.success ||
        !git.success ||
        !packageJson.success
      ) {
        debug.error('Prompt validation failed', null, {
          ide: ide.success,
          packageManager: packageManager.success,
          git: git.success,
          packageJson: packageJson.success,
        })
        ide.error?.issues.forEach((i) => ctx.addIssue(i))
        packageManager.error?.issues.forEach((i) => ctx.addIssue(i))
        git.error?.issues.forEach((i) => ctx.addIssue(i))
        throw Error('Failed validation')
      }

      debug.verbose('Prompt transformations complete')
      return {
        packageJson: packageJson.data,
        ide: ide.data,
        packageManager: packageManager.data,
        git: git.data,
      }
    }),
  )
  .validateAndApply({
    validate: async ({ cfg, targetPath }) => {
      debug.verbose('Validating core module', { targetPath })
      const _ = initHelpers(__dirname, targetPath)

      const issues = await _.getTemplateFilesThatWouldBeOverwritten({
        file: '**/*',
        templateFolder: './template',
        targetFolder: targetPath,
        overwrite: false,
      })

      if (ideModule._validateFn) {
        debug.verbose('Running IDE validation')
        const ideIssues = await ideModule._validateFn({
          cfg: cfg.ide,
          targetPath,
        })
        issues.push(...ideIssues)
      }

      debug.info('Validation complete', { issueCount: issues.length })
      return issues
    },
    apply: async ({ cfg, targetPath }) => {
      debug.info('Applying core module', { targetPath })
      const _ = initHelpers(__dirname, targetPath)

      debug.verbose('Copying core template files')
      await runWithSpinner({
        spinnerOptions: {
          inProgress: 'Copying core template files',
          error: 'Failed to copy core template files',
          success: 'Copied core template files',
        },
        fn: async () =>
          await _.copyTemplateFiles({
            file: '**/*',
            templateFolder: './template',
            targetFolder: '.',
            overwrite: false,
          }),
      })

      debug.verbose('Applying package.json module')
      await packageJsonModule.apply({ cfg: cfg.packageJson, targetPath })

      debug.verbose('Applying IDE module')
      await ideModule.apply({ cfg: cfg.ide, targetPath })

      debug.verbose('Applying git module')
      await gitModule._applyFn({ cfg: cfg.git, targetPath })

      debug.verbose('Applying package manager module')
      await packageManagerModule.apply({
        cfg: cfg.packageManager,
        targetPath,
      })

      debug.info('Core module application complete')
    },
  })

type DepNames<
  T extends
    (typeof createStartPackageJson)['peerDependencies'] = (typeof createStartPackageJson)['peerDependencies'],
> = keyof T

const deps = async (
  depsArray: Array<DepNames>,
): Promise<
  Exclude<
    z.infer<typeof packageJsonModule._initSchema>['dependencies'],
    undefined
  >
> => {
  debug.verbose('Resolving dependencies', { deps: depsArray })
  const result = await Promise.all(
    depsArray.map((d) => {
      const version =
        createStartPackageJson['peerDependencies'][d] === 'workspace:^'
          ? 'latest' // Use latest in development
          : createStartPackageJson['peerDependencies'][d]
      return {
        name: d,
        version: version,
      }
    }),
  )

  return result
}
