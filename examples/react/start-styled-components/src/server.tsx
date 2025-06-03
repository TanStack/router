import {
  createStartHandler,
  CustomizeStartHandler,
  defaultStreamHandler,
  StartServer,
} from '@tanstack/react-start/server'
import type { AnyRouter } from '@tanstack/react-router'
import { ServerStyleSheet } from 'styled-components'
import { renderToString } from 'react-dom/server'

import { createRouter } from './router'

export default createStylesHandler(
  createStartHandler({
    createRouter,
  }),
)(defaultStreamHandler)

function createStylesHandler<TRouter extends AnyRouter>(
  eventHandler: CustomizeStartHandler<TRouter>,
): CustomizeStartHandler<TRouter> {
  return (cb) => {
    return eventHandler(async ({ request, router, responseHeaders }) => {
      try {
        if (router.isServer) {
          const sheet = new ServerStyleSheet()
          try {
            renderToString(sheet.collectStyles(<StartServer router={router} />))
            const styleTags = sheet.getStyleTags()
            router.serverSsr!.injectHtml(() => {
              return styleTags
            })
          } catch (error) {
            throw error
          } finally {
            sheet.seal()
          }
        }
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
