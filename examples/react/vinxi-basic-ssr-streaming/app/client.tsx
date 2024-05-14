// import 'vinxi/client'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

const app = <StartClient router={router} />

router.hydrate()
hydrateRoot(document, app)
