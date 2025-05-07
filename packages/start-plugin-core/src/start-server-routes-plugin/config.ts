import { baseConfigSchema } from '@tanstack/router-generator'
import type { z } from 'zod'

export const configSchema = baseConfigSchema.extend({})

export type Config = z.infer<typeof configSchema>
