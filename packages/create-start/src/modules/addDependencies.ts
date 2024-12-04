import { z } from 'zod'
import { initHelpers } from '../utils/helpers'
import invariant from 'tiny-invariant'
import { createModule } from '../module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const addDependencies = createModule(
  z.object({
    dependencies: z
      .array(
        z.object({
          name: z.string(),
          version: z.string(),
        }),
      )
      .optional(),
    devDependencies: z
      .array(
        z.object({
          name: z.string(),
          version: z.string(),
        }),
      )
      .optional(),
  }),
).applyFn(async ({ state, targetPath }) => {
  const _ = initHelpers(__dirname, targetPath)

  const exists = await _.targetFileExists('./package.json')
  invariant(exists, "The package.json file doesn't exist")
  let packageJson = JSON.parse(await _.readTargetFile('./package.json'))

  const createDepsRecord = (deps: Array<{ name: string; version: string }>) =>
    deps.reduce(
      (
        acc: Record<string, string>,
        dep: { name: string; version: string },
      ) => ({
        ...acc,
        [dep.name]: dep.version,
      }),
      {},
    )

  const dependenciesRecord = createDepsRecord(state.dependencies ?? [])
  const devDependenciesRecord = createDepsRecord(state.devDependencies ?? [])

  packageJson = {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      ...dependenciesRecord,
    },
    devDependencies: {
      ...packageJson.devDependencies,
      ...devDependenciesRecord,
    },
  }

  await _.writeTargetfile(
    './package.json',
    JSON.stringify(packageJson, null, 2),
    true,
  )
})

export default addDependencies
