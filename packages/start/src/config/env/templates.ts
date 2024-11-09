import type { ValidAccessSchema, ValidEnvFieldUnion } from './schema'

export const ENV_MODULES_IDS = {
  client: '@tanstack/start/env/client',
  server: '@tanstack/start/env/server',
}
export const ENV_MODULES_IDS_SET = new Set(Object.values(ENV_MODULES_IDS))

export function buildTemplates(options: {
  schema: Record<string, ValidEnvFieldUnion>
  variables: Array<{ key: string; value: any; context: ValidAccessSchema }>
}): { client: string; server: string } {
  let client = ''
  let server = ''

  for (const { key, value, context } of options.variables) {
    if (context === 'client') {
      client += `export const ${key} = ${JSON.stringify(value)}\n`
    } else {
      server += `export const ${key} = ${JSON.stringify(value)}\n`
    }
  }

  return {
    client,
    server,
  }
}

export function buildTypeAnnotation(schema: ValidEnvFieldUnion) {
  const type = schema.type
  const isOptional = schema.optional
    ? schema.default !== undefined
      ? false
      : true
    : false

  return `${type}${isOptional ? ' | undefined' : ''}`
}

export const GET_ENV_INTERNAL_TEMPLATE = ({
  client,
  server,
}: {
  client: string
  server: string
}) => `declare module '@tanstack/start/env/client' {
${client}
}

declare module '@tanstack/start/env/server' {
${server}
}\n`
