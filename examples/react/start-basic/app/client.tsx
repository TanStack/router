import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'
import { Suspense } from 'react'

const router = createRouter()

// hydrateRoot(document, <StartClient router={router} />)
hydrateRoot(document.getElementById('root')!, <StartClient router={router} />)
