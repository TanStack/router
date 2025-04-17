import { configSchema } from '@tanstack/router-generator'
import { z } from 'zod'
import type { PluginOption } from 'vite'
import type { AppOptions as VinxiAppOptions } from 'vinxi'
import type { NitroOptions } from 'nitropack'
import type { Options as ViteReactOptions } from '@vitejs/plugin-react'
import type { CustomizableConfig } from 'vinxi/dist/types/lib/vite-dev'

type StartUserViteConfig = CustomizableConfig | (() => CustomizableConfig)

export function getUserViteConfig(config?: StartUserViteConfig): {
  plugins: Array<PluginOption> | undefined
  userConfig: CustomizableConfig
} {
  const { plugins, ...userConfig } =
    typeof config === 'function' ? config() : { ...config }
  return { plugins, userConfig }
}

/**
 * Not all the deployment presets are fully functional or tested.
 * @see https://github.com/TanStack/router/pull/2002
 */
const vinxiDeploymentPresets = [
  'alwaysdata', // untested
  'aws-amplify', // untested
  'aws-lambda', // untested
  'azure', // untested
  'azure-functions', // untested
  'base-worker', // untested
  'bun', // ✅ working
  'cleavr', // untested
  'cli', // untested
  'cloudflare', // untested
  'cloudflare-module', // untested
  'cloudflare-pages', // ✅ working
  'cloudflare-pages-static', // untested
  'deno', // untested
  'deno-deploy', // untested
  'deno-server', // untested
  'digital-ocean', // untested
  'edgio', // untested
  'firebase', // untested
  'flight-control', // untested
  'github-pages', // untested
  'heroku', // untested
  'iis', // untested
  'iis-handler', // untested
  'iis-node', // untested
  'koyeb', // untested
  'layer0', // untested
  'netlify', // ✅ working
  'netlify-builder', // untested
  'netlify-edge', // untested
  'netlify-static', // untested
  'nitro-dev', // untested
  'nitro-prerender', // untested
  'node', // partially working
  'node-cluster', // untested
  'node-server', // ✅ working
  'platform-sh', // untested
  'service-worker', // untested
  'static', // 🟧 partially working
  'stormkit', // untested
  'vercel', // ✅ working
  'vercel-edge', // untested
  'vercel-static', // untested
  'winterjs', // untested
  'zeabur', // untested
  'zeabur-static', // untested
] as const

type DeploymentPreset = (typeof vinxiDeploymentPresets)[number] | (string & {})

const testedDeploymentPresets: Array<DeploymentPreset> = [
  'bun',
  'netlify',
  'vercel',
  'cloudflare-pages',
  'node-server',
]

export function checkDeploymentPresetInput(
  preset?: string,
): DeploymentPreset | undefined {
  if (preset) {
    if (!vinxiDeploymentPresets.includes(preset as any)) {
      console.warn(
        `Invalid deployment preset "${preset}". Available presets are: ${vinxiDeploymentPresets
          .map((p) => `"${p}"`)
          .join(', ')}.`,
      )
    }

    if (!testedDeploymentPresets.includes(preset as any)) {
      console.warn(
        `The deployment preset '${preset}' is not fully supported yet and may not work as expected.`,
      )
    }
  }

  return preset
}

type HTTPSOptions = {
  cert?: string
  key?: string
  pfx?: string
  passphrase?: string
  validityDays?: number
  domains?: Array<string>
}

type ServerOptions_ = VinxiAppOptions['server'] & {
  https?: boolean | HTTPSOptions
}

type ServerOptions = {
  [K in keyof ServerOptions_]: ServerOptions_[K]
}

export const serverSchema = z
  .object({
    routeRules: z.custom<NitroOptions['routeRules']>().optional(),
    preset: z.custom<DeploymentPreset>().optional(),
    static: z.boolean().optional(),
    prerender: z
      .object({
        routes: z.array(z.string()),
        ignore: z
          .array(
            z.custom<
              string | RegExp | ((path: string) => undefined | null | boolean)
            >(),
          )
          .optional(),
        crawlLinks: z.boolean().optional(),
      })
      .optional(),
  })
  .and(z.custom<ServerOptions>())

const viteSchema = z.custom<StartUserViteConfig>()

const viteReactSchema = z.custom<ViteReactOptions>()

const routersSchema = z.object({
  ssr: z
    .object({
      entry: z.string().optional(),
      middleware: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  client: z
    .object({
      entry: z.string().optional(),
      base: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  server: z
    .object({
      base: z.string().optional(),
      globalMiddlewareEntry: z.string().optional(),
      middleware: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  api: z
    .object({
      entry: z.string().optional(),
      middleware: z.string().optional(),
      vite: viteSchema.optional(),
    })
    .optional(),
  public: z
    .object({
      dir: z.string().optional(),
      base: z.string().optional(),
    })
    .optional(),
})

const tsrConfig = configSchema.partial().extend({
  appDirectory: z.string().optional(),
})

export const inlineConfigSchema = z.object({
  react: viteReactSchema.optional(),
  vite: viteSchema.optional(),
  tsr: tsrConfig.optional(),
  routers: routersSchema.optional(),
  server: serverSchema.optional(),
})

export type TanStackStartInputConfig = z.input<typeof inlineConfigSchema>
export type TanStackStartOutputConfig = z.infer<typeof inlineConfigSchema>
