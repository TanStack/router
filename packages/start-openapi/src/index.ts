import { collectFromRouteTree } from './collect'
import { buildOpenApiDocument } from './emit'
import type { CollectOptions, RuntimeRouteNode } from './collect'
import type { GenerateOptions, OpenApiDocument } from './types'

export { buildOpenApiDocument } from './emit'
export {
  collectFromRouteTree,
  defaultOperationId,
  toOpenApiPath,
} from './collect'
export { defaultToJSONSchema } from './schema'
export { isStandardSchema } from './standard-schema'

export type {
  RuntimeRouteNode,
  RuntimeServerOptions,
  RuntimeMethodHandler,
  RuntimeMethodBuilderOptions,
  RuntimeMiddleware,
  CollectOptions,
} from './collect'
export type * from './types'
export type { StandardSchemaV1 } from './standard-schema'

/**
 * End-to-end: walk a live route tree and emit an OpenAPI 3.1 document.
 *
 * ```ts
 * import { routeTree } from './routeTree.gen'
 * import { generateOpenApiDocument } from '@tanstack/start-openapi'
 *
 * const spec = await generateOpenApiDocument(routeTree, {
 *   info: { title: 'My API', version: '1.0.0' },
 *   include: ['/api'],
 * })
 * ```
 */
export async function generateOpenApiDocument(
  root: RuntimeRouteNode,
  options: GenerateOptions & CollectOptions,
): Promise<OpenApiDocument> {
  const manifest = collectFromRouteTree(root, {
    include: options.include,
    methods: options.methods,
    securitySchemes: options.securitySchemes,
  })
  return buildOpenApiDocument(manifest, options)
}
