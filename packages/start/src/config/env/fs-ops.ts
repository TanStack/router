import path from 'node:path'
import fs from 'node:fs'
import {
  INTERNAL_START_TYPES_FILENAME,
  TANSTACK_DIR_NAME,
} from '../setup-fw-types.js'
import { GET_ENV_INTERNAL_TEMPLATE } from './templates.js'
import type { ValidAccessSchema } from './schema.js'

const ENV_FILE_REFERENCE = `/// <reference path="start-env/env.d.ts" />`

const START_ENV_DIR = 'start-env'
const ENV_FILENAME = 'env.d.ts'

export function writeEnvDTSFile(options: {
  root: string
  accepted: Array<{
    key: string
    context: ValidAccessSchema
    typeAnnotation: string
  }>
}) {
  const tanstackDir = path.join(options.root, TANSTACK_DIR_NAME)
  const internalStartDtsFile = path.join(
    tanstackDir,
    INTERNAL_START_TYPES_FILENAME,
  )

  const startEnvDir = path.join(options.root, TANSTACK_DIR_NAME, START_ENV_DIR)

  // make the start-env directory inside the .tanstack directory
  if (!fs.existsSync(startEnvDir)) {
    fs.mkdirSync(startEnvDir)
  }

  const envDtsFile = path.join(startEnvDir, ENV_FILENAME)

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

  // if the .tanstack/start-env/env.d.ts file doesn't exist, create it
  // or if the .tanstack/start-env/env.d.ts file exists, check if the content is different, and update if needed
  if (!existingTypesContent) {
    fs.writeFileSync(envDtsFile, template, { encoding: 'utf-8' })
  } else {
    const content = fs.readFileSync(envDtsFile, 'utf-8')
    if (content !== template) {
      fs.writeFileSync(envDtsFile, template, { encoding: 'utf-8' })
    }
  }

  // Check if the .tanstack/start-types.d.ts file has a reference to the env types
  const startRootReferencesLines = fs
    .readFileSync(internalStartDtsFile, 'utf-8')
    .split('\n')
  const hasReferenceToEnvTypes = startRootReferencesLines.some((line) =>
    line.includes(ENV_FILE_REFERENCE),
  )

  if (!hasReferenceToEnvTypes) {
    fs.writeFileSync(
      internalStartDtsFile,
      `${ENV_FILE_REFERENCE}\n${startRootReferencesLines.join('\n')}`,
      { encoding: 'utf-8' },
    )
  }
}

export function cleanupEnvDTSFile(options: { root: string }) {
  const tanstackDir = path.join(options.root, TANSTACK_DIR_NAME)
  const internalStartDtsFile = path.join(
    tanstackDir,
    INTERNAL_START_TYPES_FILENAME,
  )

  // If the root .tanstack/start-types.d.ts file doesn't exist, return
  if (!fs.existsSync(internalStartDtsFile)) {
    return
  }

  // Check if the .tanstack/start-types.d.ts file has a reference to the env types, if not, return
  const internalStartReferencesLines = fs
    .readFileSync(internalStartDtsFile, 'utf-8')
    .split('\n')
  if (
    !internalStartReferencesLines.some((line) =>
      line.includes(ENV_FILE_REFERENCE),
    )
  ) {
    return
  }

  // Remove the reference to the env types from the .tanstack/start-types.d.ts file
  const newContent = internalStartReferencesLines
    .filter((line) => !line.includes(ENV_FILE_REFERENCE))
    .join('\n')
  fs.writeFileSync(internalStartDtsFile, newContent, { encoding: 'utf-8' })

  // Check if the .tanstack/start-env/env.d.ts file exists, if not, return
  const startEnvDir = path.join(options.root, TANSTACK_DIR_NAME, START_ENV_DIR)
  const envDtsFile = path.join(startEnvDir, ENV_FILENAME)
  if (!fs.existsSync(envDtsFile)) {
    return
  }

  // Remove the .tanstack/start-env/env.d.ts file
  fs.unlinkSync(envDtsFile)
  fs.rmdirSync(startEnvDir)
}
