import process from 'node:process'
import { z } from 'zod'
import { loadEnv } from 'vite'
import { EnvFieldUnion } from './schema.js'
import { validateEnvVariables } from './validators.js'
import type { Plugin } from 'vite'

export const envValidationSchema = z.record(z.string(), EnvFieldUnion)

export function tsrValidateEnvPlugin(options: {
  schema: z.output<typeof envValidationSchema> | undefined
  root: string
}): Plugin | undefined {
  if (!options.schema) {
    return undefined
  }

  const schema = options.schema

  return {
    name: 'tanstack-start:env-plugin',
    enforce: 'pre',
    resolveId(id) {},
    load(id) {},
    buildStart() {
      const runtimeEnv = loadEnv('development', options.root, '')

      for (const [k, v] of Object.entries(runtimeEnv)) {
        if (typeof v !== 'undefined') {
          process.env[k] = v
        }
      }

      const validatedVariables = validateEnvVariables({
        variables: runtimeEnv,
        schema,
      })

      console.info('Validated env variables:', validatedVariables)
    },
    buildEnd() {},
  }
}
