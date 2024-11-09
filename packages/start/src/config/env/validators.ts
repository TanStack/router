import { buildTypeAnnotation } from './templates.js'
import { writeEnvDTSFile } from './fs-ops.js'
import type {
  ValidAccessSchema,
  ValidEnvFieldUnion,
  ValidStringFieldSchema,
} from './schema.js'

type EnvValidationResult =
  | { ok: true; value: ValidEnvFieldUnion['default'] }
  | { ok: false; error: string }
type EnvValueValidator = (value: unknown) => EnvValidationResult

function stringValidator(input: ValidStringFieldSchema): EnvValueValidator {
  return (value) => {
    if (typeof value !== 'string') {
      return { ok: false, error: 'Expected a string' }
    }

    if (input.minLength !== undefined && !(value.length >= input.minLength)) {
      console.log('value', value, value.length, input.minLength)
      return {
        ok: false,
        error: `String is less than ${input.minLength} chars`,
      }
    }

    if (input.maxLength !== undefined && !(value.length <= input.maxLength)) {
      return {
        ok: false,
        error: `String is more than ${input.maxLength} chars`,
      }
    }

    return { ok: true, value }
  }
}

function booleanValidator(): EnvValueValidator {
  return (value) => {
    if (typeof value !== 'boolean') {
      return { ok: false, error: 'Expected a boolean' }
    }

    return { ok: true, value }
  }
}

function getEnvValidator(schema: ValidEnvFieldUnion): EnvValueValidator {
  switch (schema.type) {
    case 'string': {
      return stringValidator(schema)
    }
    case 'boolean': {
      return booleanValidator()
    }
    default: {
      throw new Error(
        `Encountered an invalid env schema type: ${(schema as any)?.type}`,
      )
    }
  }
}

export function validateEnvVariables(options: {
  variables: Record<string, string>
  schema: Record<string, ValidEnvFieldUnion>
  write: boolean
  root: string
}): Array<{
  key: string
  value: unknown
  typeAnnotation: string
  context: ValidAccessSchema
}> {
  const accepted: Array<{
    key: string
    value: unknown
    typeAnnotation: string
    context: ValidAccessSchema
  }> = []
  const rejected: Array<{ key: string; error: string }> = []

  for (const [key, schema] of Object.entries(options.schema)) {
    let preValue: any =
      options.variables[key] === '' ? undefined : options.variables[key]

    if (preValue === undefined && schema.default !== undefined) {
      preValue = schema.default
    }

    if (preValue === undefined && !schema.optional) {
      rejected.push({
        key,
        error: 'Missing required environment variable',
      })
      continue
    }

    const validator = getEnvValidator(schema)
    const validatedResult = validator(preValue)

    const typeAnnotation = buildTypeAnnotation(schema)

    if (!validatedResult.ok) {
      rejected.push({ key, error: validatedResult.error })
    } else {
      accepted.push({
        key,
        value: validatedResult.value,
        typeAnnotation,
        context: schema.context,
      })
    }
  }

  if (rejected.length > 0) {
    throw new Error(
      `Encountered ${rejected.length} errors while validating environment variables:\n${rejected
        .map(({ key, error }) => `  - ${key}: ${error}`)
        .join('\n')}`,
    )
  }

  if (options.write) {
    writeEnvDTSFile({ accepted, root: options.root })
  }

  return accepted
}
