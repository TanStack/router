import { select } from '@inquirer/prompts'
import { InvalidArgumentError, createOption } from '@commander-js/extra-typings'
import invariant from 'tiny-invariant'
import { createDebugger } from '../utils/debug'
import { barebonesTemplate } from './barebones'
import type { coreModule } from '../modules/core'
import type { z } from 'zod'

const debug = createDebugger('templates')

const templates = [
  {
    id: 'barebones',
    name: 'Barebones',
    module: barebonesTemplate,
    description: 'The bare minimum',
  },
] as const

const templateIds = templates.map((t) => t.id)
export type TEMPLATE_NAME = (typeof templateIds)[number]
export const DEFAULT_TEMPLATE: TEMPLATE_NAME = 'barebones'

export const templateCliOption = createOption(
  '--template <string>',
  'Choose the template to use',
).argParser((value) => {
  if (!templateIds.includes(value as TEMPLATE_NAME)) {
    debug.error(`Invalid template specified: ${value}`)
    throw new InvalidArgumentError(
      `Invalid Template: ${value}. Only the following are allowed: ${templateIds.join(', ')}`,
    )
  }
  debug.verbose('Template validated from CLI', { template: value })
  return value as TEMPLATE_NAME
})

export const templatePrompt = async () => {
  debug.info('Prompting for template selection')
  const selection = await select({
    message: 'Which template would you like to use?',
    choices: templates.map((t) => ({
      name: t.name,
      value: t.id,
      description: t.description,
    })),
    default: DEFAULT_TEMPLATE,
  })
  debug.verbose('Template selected', { template: selection })
  return selection
}

export const scaffoldTemplate = async ({
  templateId,
  cfg,
  targetPath,
}: {
  templateId: TEMPLATE_NAME
  cfg: z.input<typeof coreModule._baseSchema>
  targetPath: string
}) => {
  debug.info('Starting template scaffolding', { templateId, targetPath })
  // const template = templates.find((f) => f.id === templateId)
  const template = templates[0] // Remove this when we add more templates
  invariant(template, `The template with ${templateId} is not valid`)

  debug.verbose('Executing template module', { template: template.id })
  await template.module.execute({
    cfg,
    targetPath,
    type: 'new-project',
    applyingMessage: `Scaffolding the ${template.name} template`,
  })
  debug.info('Template scaffolding complete')
}
