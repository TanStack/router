import { StartClient } from '@tanstack/start'
import { hydrateRoot } from 'react-dom/client'

import { createRouter } from './base.tsx'

const router = createRouter()

hydrateRoot(document.getElementById('root')!, <StartClient router={router} />)
