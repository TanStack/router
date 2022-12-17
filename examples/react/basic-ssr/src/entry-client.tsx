import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { createRouter } from './router'
import { App } from '.'

const router = createRouter()

const state = (window as any).__TANSTACK_ROUTER_STATE__

router.hydrate(state)

ReactDOM.hydrateRoot(document, <App router={router} />)
