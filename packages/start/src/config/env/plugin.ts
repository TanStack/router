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
import { cleanupEnvDTSFile } from './fs-ops.js'
import type { Plugin } from 'vite'

export const envValidationSchema = z.record(z.string(), EnvFieldUnion)

function resolveVirtualModuleId<T extends string>(id: T): `\0tss:${T}` {
  return `\0tss:${id}`
}

/**
 * TODO: Replace this with the correct Config type
 * Currently, since we've got a major rewrite going on it makes it difficult to coordinate
 * the types between the branches.
 * When the start package is settled, we can use the correct Config type that's used when
 * setting up the Start definedConfig function in the app.config.ts file.
 */
type StartEnvOptions = {
  [key: string]: any
  tsr?: {
    [key: string]: any
    appDirectory?: string
  }
  env?: {
    [key: string]: any
    schema?: z.output<typeof envValidationSchema> | undefined
  }
}

const VITE_PLUGIN_BASE: Plugin = {
  name: 'tanstack-start:env-plugin',
  enforce: 'pre',
}

export function tsrValidateEnvPlugin(options: {
  configOptions: StartEnvOptions
  root: string
  write?: boolean
}): Plugin {
  const shouldWrite = options.write ?? false

  if (
    !options.configOptions.env?.schema ||
    Object.keys(options.configOptions.env.schema).length === 0
  ) {
    return {
      ...VITE_PLUGIN_BASE,
      buildStart() {
        if (shouldWrite) {
          cleanupEnvDTSFile({ root: options.root })
        }
      },
    }
  }

  const schema = options.configOptions.env.schema

  let templates: ReturnType<typeof buildTemplates> | null = null

  return {
    ...VITE_PLUGIN_BASE,
    resolveId(id) {
      if (ENV_MODULES_IDS_SET.has(id)) {
        return resolveVirtualModuleId(id)
      }
      return undefined
    },
    load(id, _loadOptions) {
      if (id === resolveVirtualModuleId(ENV_MODULES_IDS.server)) {
        return templates?.server
      }

      if (id === resolveVirtualModuleId(ENV_MODULES_IDS.client)) {
        return templates?.client
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
        root: options.root,
        write: shouldWrite,
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
