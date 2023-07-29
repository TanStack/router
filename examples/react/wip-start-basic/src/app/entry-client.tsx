import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/react-start/client'
import { createRouter } from './router'

const router = createRouter()
await router.hydrate()

ReactDOM.hydrateRoot(document, <StartClient router={router} />)
