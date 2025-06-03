/// <reference types="vinxi/types/server" />
import {
  createStartHandler,
  defaultStreamHandler,
  StartServer,
  type EventHandler,
} from '@tanstack/react-start/server'
import { getRouterManifest } from '@tanstack/react-start/router-manifest'
import type { AnyRouter } from '@tanstack/react-router'
import { ServerStyleSheet } from 'styled-components'
import { renderToString } from 'react-dom/server'
import type { ComponentProps } from 'react'

import { createRouter } from './router'

export default createStylesHandler(
  createStartHandler({
    createRouter,
    getRouterManifest,
  }),
)(defaultStreamHandler)

function createStylesHandler<TRouter extends AnyRouter>(
  eventHandler: CustomizeStartHandler<TRouter>,
): (cb: HandlerCallback<TRouter>) => EventHandler {
  return (cb) => {
    return eventHandler(async ({ request, router, responseHeaders }) => {
      try {
        if (router.isServer) {
          const sheet = new ServerStyleSheet()
          let _styledComponents: undefined | ComponentProps<'style'> = undefined

          try {
            renderToString(sheet.collectStyles(<StartServer router={router} />))
            _styledComponents = sheet.getStyleElement()[0].props
          } catch (error) {
            throw error
          } finally {
            sheet.seal()
          }

          router.update({
            context: {
              ...router.options.context,
              _styledComponents,
            },
          })
        }

        await router.load()
      } catch (error) {
        if (error instanceof Response) {
          return error
        }
        throw error
      }
      return cb({ request, router, responseHeaders })
    })
  }
}

type HandlerCallback<TRouter extends AnyRouter> = (ctx: {
  request: Request
  router: TRouter
  responseHeaders: Headers
}) => Response | Promise<Response>
type CustomizeStartHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => EventHandler
