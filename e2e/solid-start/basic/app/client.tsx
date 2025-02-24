/// <reference types="vinxi/types/client" />
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from './router'
import { render } from 'solid-js/web'

const router = createRouter()

render(() => <StartClient router={router} />, document)
