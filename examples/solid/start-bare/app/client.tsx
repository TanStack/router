/// <reference types="vinxi/types/client" />
import { StartClient } from '@tanstack/solid-start'

import { hydrate } from 'solid-js/web'
import { createRouter } from './router'

const router = createRouter()

hydrate(() => <StartClient router={router} />, document)
