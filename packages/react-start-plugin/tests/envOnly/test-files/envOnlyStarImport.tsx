import * as TanstackStart from '@tanstack/react-start'

const serverFunc = TanstackStart.serverOnly(() => 'server')

const clientFunc = TanstackStart.clientOnly(() => 'client')
