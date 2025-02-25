/// <reference types="vinxi/types/client" />
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from './router'
import { hydrate } from 'solid-js/web'

const router = createRouter()

const appDiv = document.getElementById('app')!

hydrate(() => <StartClient router={router} />, appDiv)
