import { z } from 'zod'

const AccessSchema = z.enum(['client', 'server'])
export type ValidAccessSchema = z.infer<typeof AccessSchema>

const StringFieldSchema = z.object({
  type: z.literal('string'),
  context: AccessSchema,
  optional: z.boolean().optional(),
  default: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
})
export type ValidStringFieldSchema = z.infer<typeof StringFieldSchema>

const BooleanFieldSchema = z.object({
  type: z.literal('boolean'),
  context: AccessSchema,
  optional: z.boolean().optional(),
  default: z.boolean().optional(),
})
export type ValidBooleanFieldSchema = z.infer<typeof BooleanFieldSchema>

export const EnvFieldUnion = z.union([StringFieldSchema, BooleanFieldSchema])
export type ValidEnvFieldUnion = z.infer<typeof EnvFieldUnion>

export const stringEnv = (
  input: Omit<z.input<typeof StringFieldSchema>, 'type'>,
): z.input<typeof StringFieldSchema> => ({ ...input, type: 'string' })

export const booleanEnv = (
  input: Omit<z.input<typeof BooleanFieldSchema>, 'type'>,
): z.input<typeof BooleanFieldSchema> => ({ ...input, type: 'boolean' })
