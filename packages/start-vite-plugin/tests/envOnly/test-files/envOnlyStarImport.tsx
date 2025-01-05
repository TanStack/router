import * as TanstackStart from '@tanstack/start'

const serverFunc = TanstackStart.serverOnly(() => 'server')

const clientFunc = TanstackStart.clientOnly(() => 'client')
