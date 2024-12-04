import { select } from '@inquirer/prompts'
import { barebonesTemplate } from './barebones'
import { createOption, InvalidArgumentError } from '@commander-js/extra-typings'
import invariant from 'tiny-invariant'
import { z } from 'zod'
import { coreModule } from '../modules/core'
import { showcaseTemplate } from './showcase'

const templates = [
  {
    id: 'barebones',
    name: 'Barebones',
    module: barebonesTemplate,
    description: 'The bare minimum',
  },
  {
    id: 'showcase',
    name: 'Showcase',
    module: showcaseTemplate,
    description: 'Showcasing the core features of Tanstack Start',
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
    throw new InvalidArgumentError(
      `Invalid Template: ${value}. Only the following are allowed: ${templateIds.join(', ')}`,
    )
  }
  return value as TEMPLATE_NAME
})

export const templatePrompt = async () =>
  await select({
    message: 'Which template would you like to use?',
    choices: templates.map((t) => ({
      name: t.name,
      value: t.id,
      description: t.description,
    })),
    default: DEFAULT_TEMPLATE,
  })

export const scaffoldTemplate = async ({
  templateId,
  cfg,
  targetPath,
}: {
  templateId: TEMPLATE_NAME
  cfg: Partial<z.infer<typeof coreModule._schema>>
  targetPath: string
}) => {
  const template = templates.find((f) => f.id === templateId)
  invariant(template, `The template with ${templateId} is not valid`)
  await template.module._execute({
    cfg,
    targetPath,
    type: 'new-project',
  })
}
