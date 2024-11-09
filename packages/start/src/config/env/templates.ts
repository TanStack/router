import path from 'node:path'
import fs from 'node:fs'
import {
  INTERNAL_START_TYPES_FILENAME,
  TANSTACK_FOLDER_NAME,
} from '../frameworkTsInfer.js'
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

const GET_ENV_INTERNAL_TEMPLATE = ({
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

const REFERENCES_TEMPLATE = `/// <reference path="start-env/env.d.ts" />`

export function writeInternalDTSFile(options: {
  root: string
  accepted: Array<{
    key: string
    context: ValidAccessSchema
    typeAnnotation: string
  }>
}) {
  const tanstackFolder = path.join(options.root, TANSTACK_FOLDER_NAME)
  const internalStartDtsFile = path.join(
    tanstackFolder,
    INTERNAL_START_TYPES_FILENAME,
  )

  const envFolder = path.join(options.root, TANSTACK_FOLDER_NAME, 'start-env')

  // make the .tanstack/start-env folder
  if (!fs.existsSync(envFolder)) {
    fs.mkdirSync(envFolder)
  }

  const envDtsFile = path.join(envFolder, 'env.d.ts')

  const clientContent = options.accepted
    .filter((v) => v.context === 'client')
    .map((v) => `  export const ${v.key}: ${v.typeAnnotation};`)
    .join('\n')
  const serverContent = options.accepted
    .filter((v) => v.context === 'server')
    .map((v) => `  export const ${v.key}: ${v.typeAnnotation};`)
    .join('\n')

  const template = GET_ENV_INTERNAL_TEMPLATE({
    client: clientContent,
    server: serverContent,
  })

  const existingTypesContent = fs.existsSync(envDtsFile)

  if (!existingTypesContent) {
    fs.writeFileSync(envDtsFile, template, { encoding: 'utf-8' })
  } else {
    const content = fs.readFileSync(envDtsFile, 'utf-8')
    if (content !== template) {
      fs.writeFileSync(envDtsFile, template, { encoding: 'utf-8' })
    }
  }

  const referencesContent = fs.readFileSync(internalStartDtsFile, 'utf-8')

  if (!referencesContent.includes(REFERENCES_TEMPLATE)) {
    fs.writeFileSync(
      internalStartDtsFile,
      `${REFERENCES_TEMPLATE}\n${referencesContent}`,
      { encoding: 'utf-8' },
    )
  }
}
