import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildOpenApiDocument,
  collectFromRouteTree,
  generateOpenApiDocument,
  toOpenApiPath,
} from '../src'
import type {
  OpenApiManifest,
  StandardSchemaV1,
  ToJSONSchema,
} from '../src'

const info = { title: 'Test API', version: '1.0.0' }

/**
 * A fake Standard Schema that carries a pre-baked JSON Schema, so the *emitter*
 * can be tested deterministically without depending on any validator library's
 * conversion output.
 */
function fake(json: Record<string, any>): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (value: unknown) => ({ value }),
    },
    __json: json,
  } as any
}

const fakeConverter: ToJSONSchema = (schema) => (schema as any).__json

describe('buildOpenApiDocument (emitter)', () => {
  it('emits an OpenAPI 3.1 document from a manifest', async () => {
    const manifest: OpenApiManifest = {
      operations: [
        {
          method: 'post',
          path: '/api/v1/sequences',
          operationId: 'createSequence',
          summary: 'Create a sequence',
          tags: ['sequences'],
          request: {
            body: fake({
              $id: 'CreateSequence',
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            }),
            query: fake({
              type: 'object',
              properties: { page: { type: 'integer' } },
              required: [],
            }),
          },
          responses: {
            202: fake({
              type: 'object',
              properties: { id: { type: 'string' } },
            }),
            402: {
              description: 'Payment required',
              schema: fake({
                type: 'object',
                properties: { error: { type: 'string' } },
              }),
            },
          },
          security: ['apiKey'],
        },
      ],
      securitySchemes: [
        { name: 'apiKey', scheme: { type: 'http', scheme: 'bearer' } },
      ],
    }

    const doc = await buildOpenApiDocument(manifest, {
      info,
      toJSONSchema: fakeConverter,
    })

    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual(info)

    const op = doc.paths['/api/v1/sequences'].post
    expect(op.operationId).toBe('createSequence')
    expect(op.summary).toBe('Create a sequence')
    expect(op.tags).toEqual(['sequences'])

    // `$id` schema is hoisted to components and referenced.
    expect(op.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateSequence',
    })
    expect(doc.components.schemas.CreateSequence.properties.name).toEqual({
      type: 'string',
    })

    // Query object is split into individual, non-required params.
    expect(op.parameters).toEqual([
      { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
    ])

    // Per-status responses, with description fallbacks.
    expect(op.responses['202'].description).toBe('Successful response')
    expect(op.responses['202'].content['application/json'].schema.properties.id)
      .toBeDefined()
    expect(op.responses['402'].description).toBe('Payment required')

    // Security references the named scheme.
    expect(op.security).toEqual([{ apiKey: [] }])
    expect(doc.components.securitySchemes.apiKey).toEqual({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('declares path params from the path template even without a schema', async () => {
    const doc = await buildOpenApiDocument(
      {
        operations: [{ method: 'get', path: '/api/v1/sequences/{id}' }],
        securitySchemes: [],
      },
      { info, toJSONSchema: fakeConverter },
    )
    const params = doc.paths['/api/v1/sequences/{id}'].get.parameters
    expect(params).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ])
    // Every operation gets at least one response.
    expect(doc.paths['/api/v1/sequences/{id}'].get.responses['200']).toBeDefined()
  })

  it('lifts $defs into components and rewrites refs', async () => {
    const doc = await buildOpenApiDocument(
      {
        operations: [
          {
            method: 'post',
            path: '/things',
            request: {
              body: fake({
                type: 'object',
                properties: { inner: { $ref: '#/$defs/Inner' } },
                $defs: { Inner: { type: 'object', properties: { x: { type: 'number' } } } },
              }),
            },
          },
        ],
        securitySchemes: [],
      },
      { info, toJSONSchema: fakeConverter },
    )
    const schema = doc.paths['/things'].post.requestBody.content['application/json'].schema
    expect(schema.properties.inner).toEqual({
      $ref: '#/components/schemas/Inner',
    })
    expect(doc.components.schemas.Inner.properties.x).toEqual({ type: 'number' })
    expect(schema.$defs).toBeUndefined()
  })
})

describe('collectFromRouteTree (collector)', () => {
  it('reads declarative metadata off a live route tree', () => {
    const CreateSequence = z.object({ name: z.string() })
    const Pagination = z.object({ page: z.number().optional() })
    const SequenceResult = z.object({ id: z.string() })

    const apiKeyAuth = {
      options: {
        securityScheme: {
          name: 'bearerAuth',
          scheme: { type: 'http' as const, scheme: 'bearer' as const },
        },
      },
    }

    const tree = {
      fullPath: '/',
      children: [
        {
          fullPath: '/api/v1/sequences/$id',
          options: {
            server: {
              middleware: [apiKeyAuth],
              handlers: ({ createHandlers }: any) =>
                createHandlers({
                  POST: {
                    inputValidator: {
                      body: CreateSequence,
                      query: Pagination,
                    },
                    response: { 202: SequenceResult },
                    handler: () => new Response(),
                  },
                  // A bare handler fn carries no metadata.
                  GET: () => new Response(),
                }),
            },
          },
        },
        // A non-API route is excluded by the `include` filter.
        {
          fullPath: '/dashboard',
          options: {
            server: { handlers: { GET: () => new Response() } },
          },
        },
      ],
    }

    const manifest = collectFromRouteTree(tree, { include: ['/api'] })

    expect(manifest.operations).toHaveLength(2) // POST + GET on the api route
    const post = manifest.operations.find((o) => o.method === 'post')!
    expect(post.path).toBe('/api/v1/sequences/{id}')
    expect(post.request?.body).toBe(CreateSequence)
    expect(post.request?.query).toBe(Pagination)
    expect(post.responses).toEqual({ 202: SequenceResult })
    expect(post.security).toEqual(['bearerAuth'])

    const get = manifest.operations.find((o) => o.method === 'get')!
    expect(get.request).toBeUndefined()
    // Security from route middleware still applies to the bare GET handler.
    expect(get.security).toEqual(['bearerAuth'])

    expect(manifest.securitySchemes).toEqual([
      {
        name: 'bearerAuth',
        scheme: { type: 'http', scheme: 'bearer' },
      },
    ])
  })
})

describe('generateOpenApiDocument (end-to-end with Zod v4)', () => {
  it('produces a valid spec via the default Zod converter', async () => {
    const CreateSequence = z.object({
      name: z.string(),
      steps: z.array(z.string()).optional(),
    })

    const tree = {
      fullPath: '/',
      children: [
        {
          fullPath: '/api/sequences/$id',
          options: {
            server: {
              handlers: {
                POST: {
                  inputValidator: { body: CreateSequence },
                  response: { 200: z.object({ id: z.string() }) },
                  handler: () => new Response(),
                },
              },
            },
          },
        },
      ],
    }

    const doc = await generateOpenApiDocument(tree, {
      info,
      include: ['/api'],
    })

    const op = doc.paths['/api/sequences/{id}'].post
    // Path param derived from `$id`.
    expect(op.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ])
    // Body converted by real Zod v4 → JSON Schema.
    const body = op.requestBody.content['application/json'].schema
    expect(body.type).toBe('object')
    expect(body.properties.name).toEqual({ type: 'string' })
    expect(body.required).toEqual(['name'])
    expect(op.responses['200'].content['application/json'].schema.properties.id)
      .toBeDefined()
  })
})

describe('toOpenApiPath', () => {
  it('converts TanStack $params to OpenAPI {params}', () => {
    expect(toOpenApiPath('/api/v1/sequences/$id')).toBe('/api/v1/sequences/{id}')
    expect(toOpenApiPath('/files/$')).toBe('/files/{_splat}')
    expect(toOpenApiPath('/static/path')).toBe('/static/path')
  })
})
