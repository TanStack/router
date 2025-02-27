import { serverOnly, clientOnly } from '@tanstack/solid-start'

const serverFunc = serverOnly(() => 'server')

const clientFunc = clientOnly(() => 'client')
