import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import { z } from 'zod'
import { select } from '@inquirer/prompts'
import { createModule } from '../module'
import { createDebugger } from '../utils/debug'
import { vsCodeModule } from './vscode'

const debug = createDebugger('ide-module')

const ide = z.enum(['vscode', 'cursor', 'other'])

const schema = z.object({
  ide: ide.optional(),
})

const SUPPORTED_IDES = ide.options
type SupportedIDE = z.infer<typeof ide>
const DEFAULT_IDE = 'vscode'

export const ideCliOption = createOption(
  `--ide <${SUPPORTED_IDES.join('|')}>`,
  `use this IDE (${SUPPORTED_IDES.join(', ')})`,
).argParser((value) => {
  debug.verbose('Parsing IDE CLI option', { value })
  if (!SUPPORTED_IDES.includes(value as SupportedIDE)) {
    debug.error('Invalid IDE option provided', null, { value })
    throw new InvalidArgumentError(
      `Invalid IDE: ${value}. Only the following are allowed: ${SUPPORTED_IDES.join(', ')}`,
    )
  }
  return value as SupportedIDE
})

export const ideModule = createModule(schema)
  .init((schema) => schema)
  .prompt((schema) =>
    schema.transform(async (vals) => {
      debug.verbose('Prompting for IDE selection', { currentValue: vals.ide })
      const ide = vals.ide
        ? vals.ide
        : await select({
            message: 'Select an IDE',
            choices: SUPPORTED_IDES.map((i) => ({ value: i })),
            default: DEFAULT_IDE,
          })

      debug.info('IDE selected', { ide })
      return {
        ide,
      }
    }),
  )
  .validateAndApply({
    validate: async ({ cfg, targetPath }) => {
      debug.verbose('Validating IDE configuration', {
        ide: cfg.ide,
        targetPath,
      })
      const issues: Array<string> = []

      if (cfg.ide === 'vscode') {
        debug.verbose('Validating VSCode configuration')
        const issuesVsCode =
          (await vsCodeModule._validateFn?.({ cfg, targetPath })) ?? []
        issues.push(...issuesVsCode)
      }

      if (issues.length > 0) {
        debug.warn('IDE validation issues found', { issues })
      }
      return issues
    },
    apply: async ({ cfg, targetPath }) => {
      debug.info('Applying IDE configuration', { ide: cfg.ide, targetPath })
      await vsCodeModule._applyFn({ cfg, targetPath })
      debug.info('IDE configuration applied successfully')
    },
    spinnerConfigFn: (cfg) => {
      debug.verbose('Configuring spinner for IDE setup', { ide: cfg.ide })
      return ['vscode'].includes(cfg.ide)
        ? {
            error: `Failed to set up ${cfg.ide}`,
            inProgress: `Setting up ${cfg.ide}`,
            success: `${cfg.ide} set up`,
          }
        : undefined
    },
  })
