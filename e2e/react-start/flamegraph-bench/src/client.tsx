/// <reference types="vite/client" />
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { getRouter } from './router'

const router = getRouter()

hydrateRoot(document, <StartClient router={router} />)
