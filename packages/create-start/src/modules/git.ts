import { z } from 'zod'
import { createModule } from '../module'
import { select } from '@inquirer/prompts'
import { initGit } from '../utils/runCmd'

export const gitModule = createModule(
  z.object({
    setupGit: z.boolean(),
  }),
)
  .promptFn(async ({ state }) => {
    const setupGit =
      state.setupGit != undefined
        ? state.setupGit
        : await select({
            message: 'Initialize git',
            choices: [
              { name: 'yes', value: true },
              { name: 'no', value: false },
            ],
            default: 'yes',
          })

    return {
      setupGit,
    }
  })
  .spinnerConfig(({ state }) => {
    return state.setupGit
      ? {
          success: 'Git initalized',
          error: 'Failed to initialize git',
          inProgress: 'Initializing git',
        }
      : undefined
  })
  .applyFn(async ({ state, targetPath }) => {
    if (state.setupGit) {
      await initGit(targetPath)
    }
  })
