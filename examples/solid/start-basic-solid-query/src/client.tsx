/// <reference types="vinxi/types/client" />
import { hydrateRoot } from 'solid-dom/client'
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
