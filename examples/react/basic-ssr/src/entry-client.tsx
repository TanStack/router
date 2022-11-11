import * as React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { router } from './router'
import { App } from './App'

const state = (window as any).__TANSTACK_ROUTER_STATE__

console.log(state)

router.state = {
  ...router.state,
  ...state,
  matches: router.state.matches.map((match) => {
    const serverMatch = state.matches.find(
      (serverMatch: any) => serverMatch.route === match.matchId,
    )
    Object.assign(match, serverMatch)
    return match
  }),
}

ReactDOM.hydrateRoot(
  document.getElementById('root')!,
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
)
