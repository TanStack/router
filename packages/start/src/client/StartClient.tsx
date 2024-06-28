import { RouterProvider } from '@tanstack/react-router'
import * as React from 'react'
import { AfterEachMatch, afterHydrate } from './serialization'
import type { AnyRouter } from '@tanstack/react-router'

let cleaned = false

export function StartClient(props: { router: AnyRouter }) {
  props.router.AfterEachMatch = AfterEachMatch

  if (!props.router.state.matches.length) {
    props.router.hydrate()
    afterHydrate({ router: props.router })
  }

  if (!cleaned) {
    cleaned = true
    window.__TSR__?.cleanScripts()
  }

  return <RouterProvider router={props.router} />
}
