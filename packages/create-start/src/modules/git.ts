import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { select } from '@inquirer/prompts'
import { createModule } from '../module'
import { runCmd } from '../utils/runCmd'
import { createDebugger } from '../utils/debug'
import { checkFileExists, initHelpers } from '../utils/helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const debug = createDebugger('git-module')

async function appendToGitignore(
  targetPath: string,
  newEntries: Array<string>,
  sectionName: string,
) {
  const gitignorePath = resolve(targetPath, '.gitignore')
  debug.verbose('Handling gitignore', { gitignorePath })

  let existingContent = ''
  const exists = await checkFileExists(gitignorePath)

  if (exists) {
    existingContent = await readFile(gitignorePath, 'utf-8')
    const lines = existingContent.split('\n')

    // Find existing section
    const sectionStart = lines.findIndex(
      (line) => line.trim() === `# ${sectionName}`,
    )

    if (sectionStart !== -1) {
      // Section exists, find end (next comment or EOF)
      let sectionEnd = lines.findIndex(
        (line, i) => i > sectionStart && line.trim().startsWith('#'),
      )
      if (sectionEnd === -1) sectionEnd = lines.length

      // Get existing entries in section
      const sectionEntries = lines
        .slice(sectionStart + 1, sectionEnd)
        .map((line) => line.trim())
        .filter((line) => line !== '')

      // Filter out duplicates
      newEntries = newEntries.filter(
        (entry) =>
          !sectionEntries.some(
            (existing) => existing.toLowerCase() === entry.trim().toLowerCase(),
          ),
      )

      if (newEntries.length > 0) {
        // Insert new entries at end of section
        lines.splice(sectionEnd, 0, ...newEntries)
        await writeFile(gitignorePath, lines.join('\n'))
        debug.info('Updated existing section in gitignore file')
      }
    } else {
      // Add new section at end
      const newContent = `${existingContent}\n\n# ${sectionName}\n${newEntries.join('\n')}`
      await writeFile(gitignorePath, newContent)
      debug.info('Added new section to gitignore file')
    }
  } else {
    // Create new file with section
    const content = `# ${sectionName}\n${newEntries.join('\n')}`
    await writeFile(gitignorePath, content)
    debug.info('Created new gitignore file')
  }
}

export const gitModule = createModule(
  z.object({
    setupGit: z.boolean().optional(),
    gitIgnore: z
      .object({
        sectionName: z.string(),
        lines: z.string().array(),
      })
      .array()
      .optional(),
  }),
)
  .init((schema) => schema) // No init required
  .prompt((schema) =>
    schema.transform(async (vals) => {
      debug.verbose('Transforming git prompt schema', { vals })
      const setupGit =
        vals.setupGit != undefined
          ? vals.setupGit
          : await select({
              message: 'Initialize git',
              choices: [
                { name: 'yes', value: true },
                { name: 'no', value: false },
              ],
              default: 'yes',
            })
      debug.info('Git initialization choice made', { setupGit })
      return {
        setupGit,
        gitIgnore: vals.gitIgnore,
      }
    }),
  )
  .validateAndApply({
    apply: async ({ cfg, targetPath }) => {
      const _ = initHelpers(__dirname, targetPath)
      debug.verbose('Applying git module', { cfg, targetPath })

      if (cfg.gitIgnore && cfg.gitIgnore.length > 0) {
        for (const gitIgnore of cfg.gitIgnore) {
          await appendToGitignore(
            _.getFullTargetPath(''),
            gitIgnore.lines,
            gitIgnore.sectionName,
          )
        }
        debug.info('Created / updated .gitignore')
      }

      if (cfg.setupGit) {
        debug.info('Initializing git repository')
        try {
          await runCmd('git', ['init'], {}, targetPath)
          debug.info('Git repository initialized successfully')
        } catch (error) {
          debug.error('Failed to initialize git repository', error)
          throw error
        }
      } else {
        debug.info('Skipping git initialization')
      }
    },
    spinnerConfigFn: () => {
      return {
        success: 'Git initalized',
        error: 'Failed to initialize git',
        inProgress: 'Initializing git',
      }
    },
  })
