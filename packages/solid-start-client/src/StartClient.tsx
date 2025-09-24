import { Await, HeadContent, RouterProvider } from '@tanstack/solid-router'
import { hydrateStart } from '@tanstack/start-client-core/client'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

let hydrationPromise: Promise<AnyRouter> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

export function StartClient() {
  if (!hydrationPromise) {
    hydrationPromise = hydrateStart()
  }
  return (
    <Await
      promise={hydrationPromise}
      children={(router) => (
        <Dummy>
          <Dummy>
            <RouterProvider
              router={router}
              InnerWrap={(props) => (
                <Dummy>
                  <Dummy>
                    <HeadContent />
                    {props.children}
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
