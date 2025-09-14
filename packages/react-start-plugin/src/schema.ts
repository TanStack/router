import { z } from 'zod'
import {
  createTanStackConfig,
  createTanStackStartOptionsSchema,
} from '@tanstack/start-plugin-core'
import type { Options as ViteReactOptions } from '@vitejs/plugin-react'

export type WithReactPlugin = {
  react?: ViteReactOptions
  customViteReactPlugin?: boolean
}

const frameworkPlugin = {
  react: z.custom<ViteReactOptions>().optional(),
  customViteReactPlugin: z.boolean().optional().default(false),
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
