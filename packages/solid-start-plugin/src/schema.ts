import { z } from 'zod'
import {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
} from '@tanstack/start-plugin-core'
import type { Options as ViteSolidOptions } from 'vite-plugin-solid'

export type WithSolidPlugin = {
  solid?: ViteSolidOptions
}

const frameworkPlugin = {
  solid: z.custom<ViteSolidOptions>().optional(),
}

// eslint-disable-next-line unused-imports/no-unused-vars
const TanStackStartOptionsSchema =
  createTanStackStartOptionsSchema(frameworkPlugin)

const defaultConfig = createTanStackConfig(frameworkPlugin)

export function getTanStackStartOptions(opts?: TanStackStartInputConfig) {
  return defaultConfig.parse(opts)
}

export type TanStackStartInputConfig = z.input<
  typeof TanStackStartOptionsSchema
>
export type TanStackStartOutputConfig = ReturnType<
  typeof getTanStackStartOptions
>
