import process from 'node:process'
import { z } from 'zod'
import { loadEnv } from 'vite'
import { EnvFieldUnion } from './schema.js'
import { validateEnvVariables } from './validators.js'
import {
  ENV_MODULES_IDS,
  ENV_MODULES_IDS_SET,
  buildTemplates,
} from './templates.js'
import type { Plugin } from 'vite'

export const envValidationSchema = z.record(z.string(), EnvFieldUnion)

function resolveVirtualModuleId<T extends string>(id: T): `\0tss:${T}` {
  return `\0tss:${id}`
}

export function tsrValidateEnvPlugin(options: {
  schema: z.output<typeof envValidationSchema> | undefined
  root: string
}): Plugin | undefined {
  if (!options.schema) {
    return undefined
  }

  const schema = options.schema

  let templates: ReturnType<typeof buildTemplates> | null = null

  return {
    name: 'tanstack-start:env-plugin',
    enforce: 'pre',
    resolveId(id) {
      if (ENV_MODULES_IDS_SET.has(id)) {
        return resolveVirtualModuleId(id)
      }
      return undefined
    },
    load(id, _loadOptions) {
      if (id === resolveVirtualModuleId(ENV_MODULES_IDS.server)) {
        return templates!.server
      }

      return undefined
    },
    buildStart() {
      const runtimeEnv = loadEnv('development', options.root, '')

      for (const [k, v] of Object.entries(runtimeEnv)) {
        if (typeof v !== 'undefined') {
          process.env[k] = v
        }
      }

      const variables = validateEnvVariables({
        variables: runtimeEnv,
        schema,
      })

      templates = buildTemplates({ schema, variables })
    },
    buildEnd() {
      templates = null
    },
  }
}
