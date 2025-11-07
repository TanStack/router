import { render } from 'preact'
import { RouterClient } from '@tanstack/preact-router/ssr/client'
import { createRouterInstance } from './router'

const router = createRouterInstance()

render(<RouterClient router={router} />, document)
