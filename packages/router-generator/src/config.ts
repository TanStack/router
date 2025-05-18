import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { virtualRootRouteSchema } from './filesystem/virtual/config'
import type { VirtualRootRoute } from '@tanstack/virtual-file-routes'

export interface ConfigOptions {
  /**
   * The framework of your application, either `react` or `solid`.
   *
   * @default 'react'
   */
  target?: 'react' | 'solid'
  /**
   * This option is used to configure the Virtual File Routes feature. See the {@link https://tanstack.com/router/latest/docs/framework/react/routing/virtual-file-routes Virtual File Routes} guide for more information.
   *
   * @default undefined
   */
  virtualRouteConfig?: string | VirtualRootRoute // TODO: This should be a type
  /**
   * This option is used to identify route files in the route directory. This means that only files that start with this prefix will be considered for routing.
   *
   * @default '' all files in the route directory will be considered for routing.
   */
  routeFilePrefix?: string
  /**
   * This option is used to ignore specific files and directories in the route directory. This can be useful if you want to "opt-in" certain files or directories that you do not want to be considered for routing.
   *
   * When using this option, it allows you have structures like this where it let's you co-located related files that are not route files.
   *
   * @example
   * <pre>
   * src/routes
   * |── posts
   * │   ├── -components  // Ignored with routeFileIgnorePrefix of '-'
   * │   │   ├── Post.tsx
   * │   ├── index.tsx
   * │   ├── route.tsx
   * </pre>
   *
   * @default '-'
   */
  routeFileIgnorePrefix?: string
  /**
   * This option is used to ignore specific files and directories in the route directory. It can be used in regular expression format. For example, .((css|const).ts)|test-page will ignore files / directories with names containing .css.ts, .const.ts or test-page.
   *
   * @default undefined
   */
  routeFileIgnorePattern?: string
  /**
   * This is the path to the directory where the route files are located, relative to the cwd (current working directory).
   *
   * By default, the value is set to the following and cannot be set to an empty string or undefined.
   *
   * @default './src/routes'
   */
  routesDirectory?: string
  /**
   * This is the path to the file where the generated route tree will be saved, relative to the cwd (current working directory).
   *
   * By default, the value is set to the following and cannot be set to an empty string or undefined.
   *
   * @default './src/routeTree.gen.ts'
   */
  generatedRouteTree?: string
  /**
   * When your generated route tree is generated and when you first create a new route, those files will be formatted with the quote style you specify here.
   *
   * **Tip**: You should ignore the path of your generated route tree file from your linter and formatter to avoid conflicts.
   *
   * @default 'single'
   */
  quoteStyle?: 'single' | 'double',
  /**
   * When your generated route tree is generated and when you first create a new route, those files will be formatted with semicolons if this option is set to true.
   *
   * **Tip**: You should ignore the path of your generated route tree file from your linter and formatter to avoid conflicts.
   *
   * @default false
   */
  semicolons?: boolean,
  /**
   * This option is used to disable generating types for the route tree.
   *
   * If set to true, the generated route tree will not include any types and will be written as a .js file instead of a .ts file.
   *
   * @default false
   */
  disableTypes?: boolean;
  /**
   * This option adds file extensions to the route names in the generated route tree.
   *
   * @default false
   */
  addExtensions?: boolean;
  /**
   * This option turns off the console logging for the route generation process.
   *
   * @default false
   */
  disableLogging?: boolean;
  /**
   * {@link https://tanstack.com/start TanStack Start} leverages the generatedRouteTree file to also store a JSON tree which allows Start to easily traverse the available route tree to understand the routing structure of the application. This JSON tree is saved at the end of the generated route tree file.
   *
   * This option allows you to disable the generation of the manifest.
   *
   * @default false
   */
  disableManifestGeneration?: boolean;
  /**
   * This option turns on the formatting function on the generated route tree file, which can be time-consuming for large projects.
   *
   * @default true
   */
  enableRouteTreeFormatting?: boolean;
  __enableAPIRoutesGeneration?: boolean;
  /**
   * As a framework, TanStack Start supports the concept of API routes. This option configures the base path for API routes.
   *
   * This means that all API routes will be prefixed with /api.
   *
   * This configuration value is only useful if you are using TanStack Start.
   *
   * **Important**: This default value may conflict with your own project's routing if you planned on having a normal route with the same base path. You can change this value to avoid conflicts.
   *
   * @default '/api'
   */
  apiBase?: string;
  /**
   * This option let's you prepend content to the start of the generated route tree file.
   *
   * @default
   * ```ts
    [
     '\/* eslint-disable *\/',
     '// @ts-nocheck',
     '// noinspection JSUnusedGlobalSymbols',
    ]
   * ```
   */
  routeTreeFileHeader?: Array<string>;
  /**
   * This option let's you append content to the end of the generated route tree file.
   *
   * @default []
   */
  routeTreeFileFooter?: Array<string>;
  /**
   * This feature is only available is you are using the TanStack Router Bundler Plugin.
   *
   * This option is used to enable automatic code-splitting for non-critical route configuration items. See the "Automatic Code-Splitting" guide for more information.
   *
   * **Important**: The next major release of TanStack Router (i.e. v2), will have this value defaulted to `true`.
   *
   * @default false
   */
  autoCodeSplitting?: boolean;
  /**
   * As mentioned in the Routing Concepts guide, an index route is a route that is matched when the URL path is exactly the same as the parent route. The `indexToken` is used to identify the index route file in the route directory.
   *
   * With a value of `index`, the following filenames would equal the same runtime URL:
   *
   * ```txt
   * src/routes/posts.index.tsx -> /posts/
   * src/routes/posts/index.tsx -> /posts/
   * ```
   *
   * @default 'index'
   */
  indexToken?: string;
  /**
   * As mentioned in the Routing Concepts guide, a layout route is rendered at the specified path, and the child routes are rendered within the layout route. The `routeToken` is used to identify the layout route file in the route directory.
   *
   * With a value of `index`, the following filenames would equal the same runtime URL:
   *
   * ```txt
   * src/routes/posts.tsx -> /posts
   * src/routes/posts.route.tsx -> /posts
   * src/routes/posts/route.tsx -> /posts
   * ```
   *
   * @default 'route'
   */
  routeToken?: string;
  pathParamsAllowedCharacters?: Array<string>;
  customScaffolding?: unknown;
  experimental?: {
    enableCodeSplitting?: boolean;
  };
}

export const configSchema = z.object({
  target: z.enum(['react', 'solid']).optional().default('react'),
  virtualRouteConfig: virtualRootRouteSchema.or(z.string()).optional(),
  routeFilePrefix: z.string().optional(),
  routeFileIgnorePrefix: z.string().optional().default('-'),
  routeFileIgnorePattern: z.string().optional(),
  routesDirectory: z.string().optional().default('./src/routes'),
  generatedRouteTree: z.string().optional().default('./src/routeTree.gen.ts'),
  quoteStyle: z.enum(['single', 'double']).optional().default('single'),
  semicolons: z.boolean().optional().default(false),
  disableTypes: z.boolean().optional().default(false),
  addExtensions: z.boolean().optional().default(false),
  disableLogging: z.boolean().optional().default(false),
  disableManifestGeneration: z.boolean().optional().default(false),
  enableRouteTreeFormatting: z.boolean().optional().default(true),
  __enableAPIRoutesGeneration: z.boolean().optional(), // Internal flag to be turned on for TanStack Start
  apiBase: z.string().optional().default('/api'),
  routeTreeFileHeader: z
    .array(z.string())
    .optional()
    .default([
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
    ]),
  routeTreeFileFooter: z.array(z.string()).optional().default([]),
  autoCodeSplitting: z.boolean().optional(),
  indexToken: z.string().optional().default('index'),
  routeToken: z.string().optional().default('route'),
  pathParamsAllowedCharacters: z
    .array(z.enum([';', ':', '@', '&', '=', '+', '$', ',']))
    .optional(),
  customScaffolding: z
    .object({
      routeTemplate: z.string().optional(),
      lazyRouteTemplate: z.string().optional(),
      apiTemplate: z.string().optional(),
    })
    .optional(),
  experimental: z
    .object({
      // TODO: This has been made stable and is now "autoCodeSplitting". Remove in next major version.
      enableCodeSplitting: z.boolean().optional(),
    })
    .optional(),
}) satisfies z.ZodType<ConfigOptions>

export type Config = z.output<typeof configSchema>

type ResolveParams = {
  configDirectory: string
}

export function resolveConfigPath({ configDirectory }: ResolveParams) {
  return path.resolve(configDirectory, 'tsr.config.json')
}

export function getConfig(
  inlineConfig: ConfigOptions = {},
  configDirectory?: string,
): Config {
  if (configDirectory === undefined) {
    configDirectory = process.cwd()
  }
  const configFilePathJson = resolveConfigPath({ configDirectory })
  const exists = existsSync(configFilePathJson)

  let config: Config

  if (exists) {
    config = configSchema.parse({
      ...JSON.parse(readFileSync(configFilePathJson, 'utf-8')),
      ...inlineConfig,
    })
  } else {
    config = configSchema.parse(inlineConfig)
  }

  // If typescript is disabled, make sure the generated route tree is a .js file
  if (config.disableTypes) {
    config.generatedRouteTree = config.generatedRouteTree.replace(
      /\.(ts|tsx)$/,
      '.js',
    )
  }

  // if a configDirectory is used, paths should be relative to that directory
  if (configDirectory) {
    // if absolute configDirectory is provided, use it as the root
    if (path.isAbsolute(configDirectory)) {
      config.routesDirectory = path.resolve(
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        configDirectory,
        config.generatedRouteTree,
      )
    } else {
      config.routesDirectory = path.resolve(
        process.cwd(),
        configDirectory,
        config.routesDirectory,
      )
      config.generatedRouteTree = path.resolve(
        process.cwd(),
        configDirectory,
        config.generatedRouteTree,
      )
    }
  }

  validateConfig(config)
  return config
}

function validateConfig(config: Config) {
  if (typeof config.experimental?.enableCodeSplitting !== 'undefined') {
    const message = `
------
⚠️ ⚠️ ⚠️
ERROR: The "experimental.enableCodeSplitting" flag has been made stable and is now "autoCodeSplitting". Please update your configuration file to use "autoCodeSplitting" instead of "experimental.enableCodeSplitting".
------
`
    console.error(message)
    throw new Error(message)
  }

  if (config.indexToken === config.routeToken) {
    throw new Error(
      `The "indexToken" and "routeToken" options must be different.`,
    )
  }

  if (
    config.routeFileIgnorePrefix &&
    config.routeFileIgnorePrefix.trim() === '_'
  ) {
    throw new Error(
      `The "routeFileIgnorePrefix" cannot be an underscore ("_"). This is a reserved character used to denote a pathless route. Please use a different prefix.`,
    )
  }

  return config
}
