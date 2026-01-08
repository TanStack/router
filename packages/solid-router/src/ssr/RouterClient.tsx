import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  UnheadContext,
  createHead as createClientHead,
} from '@unhead/solid-js/client'
import { createStreamableHead as createStreamableClientHead } from '@unhead/solid-js/stream/client'
import { Await } from '../awaited'
import { HeadContent } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

let hydrationPromise: Promise<void | Array<Array<void>>> | undefined
let headInstance: ReturnType<typeof createClientHead> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

const getHeadInstance = () => {
  if (!headInstance) {
    headInstance =
      (createStreamableClientHead()) ?? createClientHead()
  }
  return headInstance
}

export function RouterClient(props: { router: AnyRouter }) {
  const head = getHeadInstance()

  if (!hydrationPromise) {
    if (!props.router.state.matches.length) {
      hydrationPromise = hydrate(props.router)
    } else {
      hydrationPromise = Promise.resolve()
    }
  }
  return (
    <UnheadContext.Provider value={head}>
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
    </UnheadContext.Provider>
  )
}
