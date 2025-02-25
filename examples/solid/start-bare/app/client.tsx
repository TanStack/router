/// <reference types="vinxi/types/client" />
import { StartClient } from '@tanstack/solid-start'

import { hydrate } from 'solid-js/web'
import { createRouter } from './router'

const router = createRouter()

const appDiv = document.getElementById('app')!

hydrate(() => <StartClient router={router} />, appDiv)
