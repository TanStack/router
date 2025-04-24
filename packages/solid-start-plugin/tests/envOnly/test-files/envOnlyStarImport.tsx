import * as TanstackStart from '@tanstack/solid-start'

const serverFunc = TanstackStart.serverOnly(() => 'server')

const clientFunc = TanstackStart.clientOnly(() => 'client')
