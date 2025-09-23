import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start/client'

hydrate(() => <StartClient />, document.body)
