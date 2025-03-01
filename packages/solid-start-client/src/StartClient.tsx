import { Await, HeadContent, RouterProvider } from '@tanstack/solid-router'
import { hydrate } from './ssr-client'
import type { AnyRouter } from '@tanstack/solid-router'
import type { JSXElement } from 'solid-js'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

export function StartClient(props: { router: AnyRouter }) {
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
