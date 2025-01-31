import { serverOnly, clientOnly } from '@tanstack/start'

const serverFunc = serverOnly(() => 'server')

const clientFunc = clientOnly(() => 'client')
