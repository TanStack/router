import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import { z } from 'zod'
import { select } from '@inquirer/prompts'
import { createModule } from '../module'
import { vsCodeModule } from './vscode'

const schema = z.object({
  ide: z.enum(['vscode', 'cursor', 'other']),
})

const SUPPORTED_IDES = schema.shape.ide.options
type SupportedIDE = z.infer<typeof schema>['ide']
const DEFAULT_IDE = 'vscode'

export const ideCliOption = createOption(
  `--ide <${SUPPORTED_IDES.join('|')}>`,
  `use this IDE (${SUPPORTED_IDES.join(', ')})`,
).argParser((value) => {
  if (!SUPPORTED_IDES.includes(value as SupportedIDE)) {
    throw new InvalidArgumentError(
      `Invalid IDE: ${value}. Only the following are allowed: ${SUPPORTED_IDES.join(', ')}`,
    )
  }
  return value as SupportedIDE
})

export const ideModule = createModule(schema)
  .promptFn(async ({ state }) => {
    const ide = state.ide
      ? state.ide
      : await select({
          message: 'Select an IDE',
          choices: SUPPORTED_IDES.map((ide) => ({ value: ide })),
          default: DEFAULT_IDE,
        })

    return {
      ide,
    }
  })
  .validateFn(async ({ state, targetPath }) => {
    const issues: Array<string> = []

    if (state.ide === 'vscode') {
      const issuesVsCode = await vsCodeModule._validate({ state, targetPath })
      issues.push(...issuesVsCode)
    }
    return issues
  })
  .spinnerConfig(({ state }) => {
    return ['vscode'].includes(state.ide)
      ? {
          error: `Failed to set up ${state.ide}`,
          inProgress: `Setting up ${state.ide}`,
          success: `${state.ide} set up`,
        }
      : undefined
  })
  .applyFn(async ({ state, targetPath }) => {
    await vsCodeModule._apply({ state, targetPath })
  })
