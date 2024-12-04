import { z } from 'zod'
import { initHelpers } from '../utils/helpers'
import invariant from 'tiny-invariant'
import { createModule } from '../module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const addScripts = createModule(
  z.object({
    scripts: z
      .array(
        z.object({
          name: z.string(),
          script: z.string(),
        }),
      )
      .optional(),
  }),
).applyFn(async ({ state, targetPath }) => {
  const _ = initHelpers(__dirname, targetPath)

  const exists = await _.targetFileExists('./package.json')
  invariant(exists, "The package.json file doesn't exist")
  let packageJson = JSON.parse(await _.readTargetFile('./package.json'))

  const createScriptsRecord = (
    scripts: Array<{ name: string; script: string }>,
  ) =>
    scripts.reduce(
      (
        acc: Record<string, string>,
        script: { name: string; script: string },
      ) => ({
        ...acc,
        [script.name]: script.script,
      }),
      {},
    )

  const scriptsRecord = createScriptsRecord(state.scripts ?? [])

  packageJson = {
    ...packageJson,
    scripts: {
      ...packageJson.scripts,
      ...scriptsRecord,
    },
  }

  await _.writeTargetfile(
    './package.json',
    JSON.stringify(packageJson, null, 2),
    true,
  )
})

export default addScripts
