import { hydrate } from '@tanstack/router-core/ssr/client'
import { Await } from '../awaited'
import { HeadContent } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import { Scripts } from '../Scripts'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'
import { HydrationScript } from 'solid-js/web'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

export function RouterClient(props: { router: AnyRouter }) {
  if (!hydrationPromise) {
    if (!props.router.state.matches.length) {
      hydrationPromise = hydrate(props.router)
    } else {
      hydrationPromise = Promise.resolve()
    }
  }
  return (
    <Await
      promise={hydrationPromise}
      children={() => (
        <Dummy>
          <Dummy>
            <RouterProvider
              router={props.router}
              InnerWrap={(props) => (
                <Dummy>
                  <Dummy>
                    <html>
                      <head>
                        <HydrationScript />
                        <HeadContent />
                      </head>
                      <body>
                        {props.children}
                        <Scripts />
                      </body>
                    </html>
                  </Dummy>
                  <Dummy />
                </Dummy>
              )}
            />
          </Dummy>
        </Dummy>
      )}
    />
  )
}
