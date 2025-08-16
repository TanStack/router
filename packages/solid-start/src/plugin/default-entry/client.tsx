import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start'
import { createStart } from '#tanstack-start-createStart-entry'

hydrate(() => <StartClient createStart={createStart} />, document.body)
