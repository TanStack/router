/**
 *  @file it is important that this file have the .tsx, NOT .ts, extension, else you will see this in your browser:
 * {
 *  "statusCode": 500,
 *  "error": "Internal Server Error",
 *  "message": "Cannot read properties of null (reading 'useMemo')"
 * }
 * because ts-node won't import react
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createMemoryHistory, rootRouteId } from '@tanstack/react-router'
import type { FastifyViteOptions } from '@fastify/vite'
import ReactDOMServer from 'react-dom/server'
import { StartServer } from '@tanstack/start/server'

import type ClientModule from '../client/index.ts'
import { createCaller } from './routers/index.ts'

type FastifyViteRendererOptions = Exclude<
  FastifyViteOptions['renderer'],
  string | undefined
>

const renderer: FastifyViteRendererOptions = {
  // default is to look for index.(t|j)sx? in vite project root
  // clientModule,
  createHtmlFunction(
    /** @param source - the contents of the html file to send to the client, after vite modifies it but before we inject our SSR content */
    _source,
    _scope: FastifyInstance,
    _config: FastifyViteRendererOptions,
  ) {
    // the returned function decorates FastifyReply as the "html" method
    return async function (this: FastifyReply) {
      console.log(`Rendering: ${this.request.originalUrl}...`)
      this.type('text/html')
        // return value of createRenderFunction
        .send(await (this.render as () => Promise<string>)())
    }
  },
  // @ts-expect-error
  createRenderFunction({
    createApp,
  }: {
    createApp: (typeof ClientModule)['createApp']
  }) {
    // the returned function decorates FastifyReply as the "render" method
    return async function (this: FastifyReply) {
      const router = createApp()
      router.update({
        context: {
          ...router.options.context,
          caller: createCaller({}),
        },
        history: createMemoryHistory({
          initialEntries: [this.request.originalUrl],
        }),
      })
      await router.load()
      this.statusCode = router.hasNotFoundMatch() ? 404 : 200

      return `<!DOCTYPE html>${ReactDOMServer.renderToString(<StartServer router={router} />)}`
    }
  },
  createRoute(
    {
      // return value of createErrorHandler
      errorHandler,
      // return value of createRouteHandler
      handler,
      // createRoute is called for each route in the routes array property on the object returned from prepareClient
      route,
    },
    scope,
    _config,
  ) {
    scope.route({
      url: (route as { path: string }).path,
      method: 'GET',
      handler: handler as (
        request: FastifyRequest,
        reply: FastifyReply,
      ) => Promise<void>,
      errorHandler,
    })
  },
  createRouteHandler(_client, _scope, _config) {
    return async (_request, reply) => {
      // return value of createHtmlFunction
      return reply.html()
    }
  },
  createErrorHandler(_client, _scope, _config) {
    return (error, _request, reply) => {
      console.error(error)
      reply?.code(500).type('application/json').send(JSON.stringify({ error }))
    }
  },
  async prepareClient(
    clientModule: typeof ClientModule,
    _scope,
    _config: FastifyViteRendererOptions,
  ) {
    return Object.assign({}, clientModule, {
      /**
       * @see https://fastify-vite.dev/guide/router-integration#router-integration
       * @see https://fastify-vite.dev/config/#prepareclient-clientmodule-scope-config
       *
       * \@fastify/vite will create fastify routes for us automatically based on our \@tanstack/react-router routes!  how cool is that?
       */
      routes: Object.entries(clientModule.createApp().routesById).reduce(
        (pv, [key, { fullPath }]) =>
          key === rootRouteId
            ? pv
            : (() => {
                // dynamic route segments with @tanstack/react-router are prefixed with "$" but in fastify they are prefixed with ":"
                let fp = fullPath.replaceAll('$', ':')

                // for route paths that end in '/' and are NOT the index route, trim the trailing '/'
                if (fp.length > 1 && fp.endsWith('/')) {
                  fp = fp.slice(0, -1)
                }

                return pv.concat({ path: fp })
              })(),
        [] as Array<{ path: string }>,
      ),
    })
  },
}

export default renderer
